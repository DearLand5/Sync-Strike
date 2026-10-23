package com.syncstrike.game;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Обёртка Sync Strike: полноэкранная горизонтальная WebView с игрой из assets/index.html.
 * Выбор MP3 — через системный выбор файлов; «Назад» в бою ставит игру на паузу.
 */
public class MainActivity extends Activity {
    private static final int PICK_AUDIO = 1;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);              // localStorage: настройки, раскладка, рекорды
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        web.setBackgroundColor(0xFF0B0C10);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new GameChromeClient(this));
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
        hideSystemBars();
    }

    /** Открыть системный выбор аудиофайла для <input type=file> на странице. */
    boolean openFilePicker(ValueCallback<Uri[]> callback) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("audio/*");
        try {
            startActivityForResult(Intent.createChooser(i, "Выберите трек"), PICK_AUDIO);
            return true;
        } catch (Exception e) {
            fileCallback = null;
            return false;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == PICK_AUDIO && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    /** Полноэкранный режим без системных панелей (возвращаются свайпом и снова прячутся). */
    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // в бою — пауза; на экране меню — вернуться назад; в главном меню — выйти
        String js = "(function(){var g=window.__game;if(!g)return 0;"
            + "if(g.state==='battle'){g.pause();return 1}"
            + "if(g.state==='editor'){g.closeEditor();return 1}"
            + "if(g.ui&&g.ui.screen==='pause'){g.resume();return 1}"
            + "if(g.ui&&g.ui.screen&&g.ui.screen!=='menu'){g.ui.show(g.battleActive?'pause':'menu');return 1}"
            + "return 0})()";
        web.evaluateJavascript(js, new BackResult(this));
    }

    /** Результат JS-обработки «Назад»: 0 — игра в главном меню, можно выйти. */
    static final class BackResult implements ValueCallback<String> {
        private final Activity activity;
        BackResult(Activity a) { activity = a; }
        @Override public void onReceiveValue(String value) { if ("0".equals(value)) activity.finish(); }
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();      // браузерная вкладка «скрыта» → игра сама ставит бой на паузу
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
