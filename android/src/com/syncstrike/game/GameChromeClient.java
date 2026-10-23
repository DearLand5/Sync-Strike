package com.syncstrike.game;

import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

/** Передаёт выбор файла (<input type=file>) в MainActivity. */
final class GameChromeClient extends WebChromeClient {
    private final MainActivity activity;

    GameChromeClient(MainActivity activity) { this.activity = activity; }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        return activity.openFilePicker(callback);
    }
}
