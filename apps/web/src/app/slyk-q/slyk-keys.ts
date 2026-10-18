/**
 * Remote-control key model of the Slyk Q shell. Every screen reacts to these
 * logical keys rather than raw `KeyboardEvent.key` values, so a TV remote
 * (HbbTV/Android TV key names), a keyboard and a media keyboard all drive
 * the same navigation as an Enigma2 receiver's RCU.
 */
export type SlykKey =
    | 'up'
    | 'down'
    | 'left'
    | 'right'
    | 'ok'
    | 'back'
    | 'channelUp'
    | 'channelDown'
    | 'epg'
    | 'info'
    | 'menu'
    | 'red'
    | 'green'
    | 'yellow'
    | 'blue'
    | 'tv'
    | 'digit';

export interface SlykKeyPress {
    key: SlykKey;
    /** 0-9 for `digit`, otherwise null. */
    digit: number | null;
}

const KEY_MAP: Record<string, SlykKey> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Enter: 'ok',
    NumpadEnter: 'ok',
    Select: 'ok',
    Escape: 'back',
    Backspace: 'back',
    BrowserBack: 'back',
    GoBack: 'back',
    Exit: 'back',
    PageUp: 'channelUp',
    ChannelUp: 'channelUp',
    '+': 'channelUp',
    PageDown: 'channelDown',
    ChannelDown: 'channelDown',
    '-': 'channelDown',
    Guide: 'epg',
    g: 'epg',
    e: 'epg',
    Info: 'info',
    i: 'info',
    ContextMenu: 'menu',
    Home: 'menu',
    m: 'menu',
    F1: 'red',
    ColorF0Red: 'red',
    F2: 'green',
    ColorF1Green: 'green',
    F3: 'yellow',
    ColorF2Yellow: 'yellow',
    F4: 'blue',
    ColorF3Blue: 'blue',
    TV: 'tv',
    t: 'tv',
};

/** Maps a keyboard/remote event to a Slyk key, or null when it is not one. */
export function toSlykKey(event: KeyboardEvent): SlykKeyPress | null {
    if (event.ctrlKey || event.altKey || event.metaKey) {
        return null;
    }
    if (/^[0-9]$/.test(event.key)) {
        return { key: 'digit', digit: Number(event.key) };
    }
    const mapped =
        KEY_MAP[event.key] ?? KEY_MAP[event.key.toLowerCase()] ?? null;
    return mapped ? { key: mapped, digit: null } : null;
}

/** Moves a list cursor with wrap-around, as Enigma2 listboxes do. */
export function wrapIndex(index: number, delta: number, length: number) {
    if (length <= 0) {
        return 0;
    }
    return (((index + delta) % length) + length) % length;
}

/** Clamped page step used by the long Slyk lists (channel up/down = page). */
export function pageIndex(
    index: number,
    direction: 1 | -1,
    pageSize: number,
    length: number
) {
    if (length <= 0) {
        return 0;
    }
    return Math.min(length - 1, Math.max(0, index + direction * pageSize));
}
