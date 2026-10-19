import { computed, Injectable, signal } from '@angular/core';
import { Channel } from '@iptvnator/shared/interfaces';

const RECENT_KEY = 'slyk-q-recent';
const MAX_RECENT = 12;

function readRecent(): string[] {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(parsed)
            ? parsed.filter((v): v is string => typeof v === 'string')
            : [];
    } catch {
        return [];
    }
}

/** Channels watched lately, newest first, for the home page's rail. */
@Injectable()
export class SlykRecentService {
    private readonly keys = signal<string[]>(readRecent());

    add(channel: Channel | null | undefined): void {
        const key = channel?.url || channel?.id;
        if (!key) {
            return;
        }
        const next = [key, ...this.keys().filter((k) => k !== key)].slice(
            0,
            MAX_RECENT
        );
        this.keys.set(next);
        try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        } catch {
            // Not remembered without storage.
        }
    }

    /** The recent channels present in a line-up, newest first. */
    readonly in = (channels: () => readonly Channel[]) =>
        computed(() => {
            const byKey = new Map<string, Channel>();
            for (const channel of channels()) {
                byKey.set(channel.url, channel);
                byKey.set(channel.id, channel);
            }
            return this.keys()
                .map((key) => byKey.get(key))
                .filter((c): c is Channel => !!c);
        });
}
