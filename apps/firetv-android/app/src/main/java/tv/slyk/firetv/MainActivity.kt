package tv.slyk.firetv

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.ui.PlayerView

/**
 * Slyk Q on Fire TV: the receiver screens (IPTVnator's web build, bundled in
 * assets) run in a transparent WebView laid over the device's own video
 * player, which the page positions through the `SlykNative` bridge.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var player: NativePlayer
    private lateinit var backend: SlykBackend

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        val playerView = PlayerView(this).apply {
            useController = false
            setShutterBackgroundColor(Color.BLACK)
            visibility = View.INVISIBLE
        }
        root.addView(playerView, FrameLayout.LayoutParams(0, 0))

        webView = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            // Provider logos are plain http on an https page.
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            isFocusable = true
            isFocusableInTouchMode = true
        }
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)

        player = NativePlayer(this, playerView, webView.settings.userAgentString)
        backend = SlykBackend(this, webView)
        webView.addJavascriptInterface(Bridge(), "SlykNative")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = backend.handle(request)
        }
        webView.loadUrl("${SlykBackend.ORIGIN}/tv")
        webView.requestFocus()
    }

    /**
     * Fire TV remote buttons the page cannot see on its own (Back, Menu and
     * the media keys) are replayed as the keyboard keys Slyk Q understands.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> "Escape"
            KeyEvent.KEYCODE_MENU -> "m"
            KeyEvent.KEYCODE_GUIDE -> "g"
            KeyEvent.KEYCODE_INFO -> "i"
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "i"
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "PageUp"
            KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_MEDIA_REWIND -> "PageDown"
            KeyEvent.KEYCODE_PROG_RED -> "F1"
            KeyEvent.KEYCODE_PROG_GREEN -> "F2"
            KeyEvent.KEYCODE_PROG_YELLOW -> "F3"
            KeyEvent.KEYCODE_PROG_BLUE -> "F4"
            else -> null
        }
        if (key == null) {
            return super.dispatchKeyEvent(event)
        }
        if (event.action == KeyEvent.ACTION_DOWN) {
            webView.evaluateJavascript(
                "document.dispatchEvent(new KeyboardEvent('keydown',{key:'$key',bubbles:true,cancelable:true}));",
                null
            )
        }
        return true
    }

    override fun onPause() {
        super.onPause()
        player.pause()
    }

    override fun onResume() {
        super.onResume()
        player.resume()
    }

    override fun onDestroy() {
        player.release()
        webView.destroy()
        super.onDestroy()
    }

    /** Called from the page; every call is moved to the UI thread. */
    private inner class Bridge {
        @JavascriptInterface
        fun play(request: String) = runOnUiThread { player.play(request) }

        @JavascriptInterface
        fun stop() = runOnUiThread { player.stop() }

        @JavascriptInterface
        fun setFrame(x: Double, y: Double, width: Double, height: Double) =
            runOnUiThread {
                player.setFrame(x, y, width, height, resources.displayMetrics.density)
            }

        @JavascriptInterface
        fun parseResult(token: String, json: String) =
            backend.completeParse(token, json)
    }
}
