package com.ebrahilok.trazo;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 41;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST); }
                catch (Exception error) { fileCallback = null; Toast.makeText(MainActivity.this, "No se pudo abrir el selector", Toast.LENGTH_SHORT).show(); return false; }
                return true;
            }
        });
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.loadUrl("file:///android_asset/index.html");
        setContentView(webView);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    public class AndroidBridge {
        @JavascriptInterface public void saveFile(String base64, String filename, String mime, boolean share) {
            new Thread(() -> {
                try {
                    byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                    Uri uri;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Trazo");
                        uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri == null) throw new IllegalStateException("No se pudo crear el archivo");
                        try (OutputStream stream = getContentResolver().openOutputStream(uri)) { if (stream == null) throw new IllegalStateException(); stream.write(bytes); }
                    } else {
                        File directory = new File(getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "Trazo");
                        if (!directory.exists()) directory.mkdirs();
                        File file = new File(directory, filename);
                        try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }
                        uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", file);
                    }
                    Uri finalUri = uri;
                    runOnUiThread(() -> {
                        if (share) {
                            Intent intent = new Intent(Intent.ACTION_SEND);
                            intent.setType(mime); intent.putExtra(Intent.EXTRA_STREAM, finalUri); intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            startActivity(Intent.createChooser(intent, "Compartir con WhatsApp, Drive u otra aplicación"));
                        } else Toast.makeText(MainActivity.this, Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? "Guardado en Descargas/Trazo" : "Guardado en los archivos privados de Trazo. Usa Compartir para enviarlo a Drive.", Toast.LENGTH_LONG).show();
                    });
                } catch (Exception error) { runOnUiThread(() -> Toast.makeText(MainActivity.this, "No se pudo guardar el archivo", Toast.LENGTH_LONG).show()); }
            }).start();
        }
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("(function(){var color=document.getElementById('colorOverlay');if(color&&!color.hidden){color.hidden=true;return true}var panel=document.getElementById('panel');if(panel&&panel.classList.contains('open')){panel.classList.remove('open');return true}return false})()", handled -> {
            if (!"true".equals(handled)) { if (webView.canGoBack()) webView.goBack(); else finishBack(); }
        });
    }

    private void finishBack() { super.onBackPressed(); }
}
