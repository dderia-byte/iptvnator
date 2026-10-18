package tv.slyk.firetv

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayInputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Serves the bundled IPTVnator web build and stands in for its self-hosted
 * web backend (`apps/web-backend`), so the app needs no server: the routes
 * the PWA calls under BACKEND_URL are answered here, on the device.
 *
 * - `provider-targets` registers a provider URL (the page's POST is turned
 *   into a GET by the shim in `app-config.js`, since WebView interception
 *   cannot read request bodies).
 * - `xtream` proxies `player_api.php` and wraps the reply as `{action, payload}`.
 * - `parse` downloads an M3U and has the page parse it with IPTVnator's own
 *   parser (`slyk-backend.js`), so channels match the desktop import exactly.
 */
class SlykBackend(private val context: Context, private val webView: WebView) {
    companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"
        private const val API = "/api/"
        private const val USER_AGENT = "IPTVnator"
    }

    private val http = OkHttpClient.Builder()
        .followRedirects(true)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()
    private val targets = ConcurrentHashMap<String, String>()
    private val rawPlaylists = ConcurrentHashMap<String, String>()
    private val parseResults = ConcurrentHashMap<String, String>()
    private val parseLatches = ConcurrentHashMap<String, CountDownLatch>()

    fun handle(request: WebResourceRequest): WebResourceResponse? {
        val url = request.url
        if (!url.toString().startsWith(ORIGIN)) {
            return null
        }
        val path = url.path ?: "/"
        return try {
            if (path.startsWith(API)) api(path.removePrefix(API), url) else asset(path)
        } catch (error: Exception) {
            json(JSONObject().put("status", 500).put("message", error.message ?: "Error"), 500)
        }
    }

    private fun api(route: String, url: Uri): WebResourceResponse = when (route) {
        "health" -> json(JSONObject().put("status", "ok").put("service", "slyk-q-firetv"))
        "provider-targets" -> registerTarget(url)
        "xtream" -> xtream(url)
        "parse" -> parse(url)
        "raw" -> text(rawPlaylists.remove(url.getQueryParameter("token")) ?: "")
        "connectivity-guard/reset" -> json(JSONObject().put("reset", false))
        else -> json(
            JSONObject().put("status", 501).put("message", "Not available in the Fire TV app"),
            if (route.startsWith("v1/")) 404 else 501
        )
    }

    private fun registerTarget(url: Uri): WebResourceResponse {
        val target = url.getQueryParameter("url")?.trim()
        if (target.isNullOrEmpty() || !(target.startsWith("http://") || target.startsWith("https://"))) {
            return json(JSONObject().put("status", 400).put("message", "Missing url"), 400)
        }
        val id = UUID.nameUUIDFromBytes(target.toByteArray()).toString()
        targets[id] = target
        return json(JSONObject().put("targetId", id))
    }

    private fun xtream(url: Uri): WebResourceResponse {
        val target = targets[url.getQueryParameter("targetId")]
            ?: return json(JSONObject().put("status", 404).put("message", "Unknown target"))
        val connectionTest = url.getQueryParameter("connectionTest") == "true"
        val api = Uri.parse(xtreamApiUrl(target)).buildUpon()
        for (name in url.queryParameterNames) {
            if (name != "targetId" && name != "connectionTest") {
                url.getQueryParameter(name)?.let { api.appendQueryParameter(name, it) }
            }
        }
        return try {
            val body = get(api.build().toString(), null)
            json(
                JSONObject()
                    .put("action", url.getQueryParameter("action") ?: JSONObject.NULL)
                    .put("payload", JSONTokener(body).nextValue())
            )
        } catch (error: Exception) {
            if (connectionTest) {
                json(JSONObject().put(
                    "connectionFailure",
                    JSONObject().put("kind", "connection").put("canTryHttp", false)
                ))
            } else {
                json(JSONObject().put("status", 500).put("message", error.message ?: "Error"))
            }
        }
    }

    /** `{origin}{path without a trailing script}/player_api.php`. */
    private fun xtreamApiUrl(target: String): String {
        val parsed = Uri.parse(target)
        val path = (parsed.path ?: "")
            .replace(Regex("/(player_api|get|xmltv|panel_api)\\.php$", RegexOption.IGNORE_CASE), "")
            .trimEnd('/')
        return "${parsed.scheme}://${parsed.encodedAuthority}$path/player_api.php"
    }

    private fun parse(url: Uri): WebResourceResponse {
        val target = targets[url.getQueryParameter("targetId")]
            ?: return json(JSONObject().put("status", 404).put("message", "Unknown target"), 404)
        val text = try {
            get(target, url.getQueryParameter("userAgent"))
        } catch (error: IOException) {
            return json(JSONObject().put("status", 502).put("message", error.message ?: "Download failed"), 502)
        }
        val token = UUID.randomUUID().toString()
        val latch = CountDownLatch(1)
        rawPlaylists[token] = text
        parseLatches[token] = latch
        val title = target.substringAfterLast('/').substringBefore('?').ifEmpty { "Playlist" }
        webView.post {
            webView.evaluateJavascript(
                "window.__slykParse(${JSONObject.quote(token)},${JSONObject.quote(target)},${JSONObject.quote(title)})",
                null
            )
        }
        latch.await(180, TimeUnit.SECONDS)
        parseLatches.remove(token)
        rawPlaylists.remove(token)
        val result = parseResults.remove(token)
            ?: return json(JSONObject().put("status", 500).put("message", "Playlist could not be parsed"), 500)
        return WebResourceResponse("application/json", "utf-8", 200, "OK", noCache(), result.byteInputStream())
    }

    fun completeParse(token: String, json: String) {
        parseResults[token] = json
        parseLatches[token]?.countDown()
    }

    private fun get(url: String, userAgent: String?): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", userAgent?.ifBlank { null } ?: USER_AGENT)
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code}")
            }
            return response.body?.string() ?: ""
        }
    }

    private fun asset(path: String): WebResourceResponse {
        val relative = path.trimStart('/').ifEmpty { "index.html" }
        val file = if (assetExists("web/$relative")) relative else "index.html"
        val stream = context.assets.open("web/$file")
        return WebResourceResponse(mimeType(file), if (isText(file)) "utf-8" else null, 200, "OK", noCache(), stream)
    }

    private fun assetExists(path: String): Boolean = try {
        context.assets.open(path).close()
        true
    } catch (_: IOException) {
        false
    }

    private fun mimeType(file: String): String = when (file.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "application/javascript"
        "css" -> "text/css"
        "json", "webmanifest" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "ico" -> "image/x-icon"
        "woff2" -> "font/woff2"
        "woff" -> "font/woff"
        "ttf" -> "font/ttf"
        else -> "application/octet-stream"
    }

    private fun isText(file: String) =
        mimeType(file).let { it.startsWith("text/") || it.endsWith("javascript") || it.endsWith("json") || it.endsWith("xml") }

    private fun noCache() = mapOf("Cache-Control" to "no-store")

    private fun json(body: Any, status: Int = 200): WebResourceResponse =
        text(body.toString(), "application/json", status)

    private fun text(body: String, type: String = "text/plain", status: Int = 200) =
        WebResourceResponse(type, "utf-8", status, if (status == 200) "OK" else "Error", noCache(), ByteArrayInputStream(body.toByteArray()))
}
