package com.gamepicker;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import android.net.http.HttpResponseCache;

import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;

/**
 * Hosts the web UI from assets/www under a fake https origin
 * (https://gamepicker.local/) so YouTube embeds and fetch() behave like a real site.
 */
public class MainActivity extends Activity {
    static final String HOST = "gamepicker.local";
    /** Onde a interface é publicada (GitHub Pages). Mudanças lá chegam ao app sem reinstalar. */
    static final String REMOTE = "https://virtongameplaysrj.github.io/hoje-eu-jogo/";
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {   // cache HTTP em disco: respeita o max-age do GitHub Pages (10 min)
            HttpResponseCache.install(new File(getCacheDir(), "http"), 30L * 1024 * 1024);
        } catch (Exception ignored) { }
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#0b0b12"));
        w.setNavigationBarColor(Color.parseColor("#0b0b12"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b0b12"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;      // network as usual
                String path = u.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                // A fonte (GitHub ou cópia do APK) é decidida UMA vez, no index.html, e vale para
                // todos os arquivos desta abertura: misturar versões quebra o app.
                InputStream remote = null;
                if (path.equals("/index.html")) {
                    remote = fetchRemote(path, false);
                    remoteSession = remote != null;
                } else if (remoteSession) {
                    remote = fetchRemote(path, false);                    // 1ª tentativa
                    if (remote == null) remote = fetchRemote(path, false); // 2ª tentativa
                    if (remote == null) remote = fetchRemote(path, true);  // cópia do cache, mesmo vencida
                }
                if (remote != null) return new WebResourceResponse(mime(path), "utf-8", remote);
                // sem internet: cópia embutida no APK (último recurso numa sessão remota)
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(mime(path), "utf-8", in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                            new HashMap<String, String>(), null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;                                     // external links open outside
            }
        });

        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    /** true quando o index.html desta abertura veio do GitHub Pages. */
    private volatile boolean remoteSession = false;

    /**
     * Busca o arquivo no GitHub Pages, com cache HTTP em disco; null se falhar.
     * cacheOnly: não vai à rede, aceita a cópia guardada mesmo se estiver vencida (até 30 dias).
     */
    private InputStream fetchRemote(String path, boolean cacheOnly) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(REMOTE + path.substring(1)).openConnection();
            c.setConnectTimeout(8000);   // rede móvel "acordando" pode levar alguns segundos
            c.setReadTimeout(20000);
            c.setUseCaches(true);
            if (cacheOnly) c.addRequestProperty("Cache-Control", "only-if-cached, max-stale=2592000");
            if (c.getResponseCode() != 200) { c.disconnect(); return null; }
            return c.getInputStream();
        } catch (Exception e) {
            if (c != null) c.disconnect();
            return null;
        }
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }
}
