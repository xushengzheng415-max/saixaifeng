package cn.sxffootball.platform;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 平台运营中心 Android 客户端（平板）。
 *
 * 只是把已经上线的 https://pingtai.sxffootball.cn 装进独立窗口，
 * 不复制页面、不另写业务逻辑，账号、权限和数据仍由 webLoginApi 判定。
 */
public class MainActivity extends Activity {

    private static final String PLATFORM_HOST = "pingtai.sxffootball.cn";
    private static final String START_URL = "https://pingtai.sxffootball.cn/#/platform-login";
    private static final int REQUEST_FILE_CHOOSER = 1001;
    private static final long MAX_BRIDGE_BYTES = 32L * 1024 * 1024;

    /** 把页面里的 blob 导出（a[download]）交给原生保存，WebView 自身不处理 blob 链接。 */
    private static final String BRIDGE_JS = "(function(){"
            + "if(window.__sxfBridgeReady){return;}window.__sxfBridgeReady=true;"
            + "function toast(m){try{window.SxfApp.showToast(m);}catch(e){}}"
            + "document.addEventListener('click',function(event){"
            + "var target=event.target;var anchor=target&&target.closest?target.closest('a[download]'):null;"
            + "if(!anchor){return;}var href=anchor.getAttribute('href')||'';if(href.indexOf('blob:')!==0){return;}"
            + "event.preventDefault();fetch(href).then(function(response){return response.arrayBuffer();}).then(function(buffer){"
            + "var bytes=new Uint8Array(buffer);"
            + "if(bytes.length>" + MAX_BRIDGE_BYTES + "){toast('文件超过 32MB，请用浏览器打开本页导出');return;}"
            + "var binary='';var chunk=32768;for(var i=0;i<bytes.length;i+=chunk){binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));}"
            + "var name=anchor.getAttribute('download')||('sxf-download-'+Date.now());"
            + "window.SxfApp.saveBase64(name,window.btoa(binary));"
            + "}).catch(function(){toast('导出失败，请用浏览器打开本页重试');});"
            + "},true);"
            + "})();";

    private FrameLayout root;
    private WebView webView;
    private ProgressBar progressBar;
    private TextView errorView;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#1B5E20"));
        window.setNavigationBarColor(Color.parseColor("#1B5E20"));
        setContentView(buildLayout());
        configureWebView();
        webView.loadUrl(START_URL);
    }

    private View buildLayout() {
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F6F8F7"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F6F8F7"));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(ColorStateList.valueOf(Color.parseColor("#1B5E20")));
        progressBar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#E3EBE6")));
        progressBar.setVisibility(View.GONE);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(3, Math.round(3 * getResources().getDisplayMetrics().density)));
        progressParams.gravity = Gravity.TOP;
        root.addView(progressBar, progressParams);

        errorView = new TextView(this);
        errorView.setText("网络连接不可用\n检查网络后点击这里重试");
        errorView.setTextColor(Color.parseColor("#425149"));
        errorView.setTextSize(15f);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(padding, padding, padding, padding);
        errorView.setBackgroundColor(Color.parseColor("#F6F8F7"));
        errorView.setVisibility(View.GONE);
        errorView.setOnClickListener(v -> {
            errorView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.reload();
        });
        root.addView(errorView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        return root;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " SxfPlatformApp/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new NativeBridge(), "SxfApp");
        webView.setWebViewClient(new PlatformClient());
        webView.setWebChromeClient(new PlatformChromeClient());
        webView.setDownloadListener(new PlatformDownloadListener());
    }

    private void showErrorPage() {
        progressBar.setVisibility(View.GONE);
        webView.setVisibility(View.INVISIBLE);
        errorView.setVisibility(View.VISIBLE);
    }

    private boolean openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可打开该链接的应用", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    /** 只有平台域名在本应用内打开，其他链接交给系统浏览器，避免把外部页面塞进客户端。 */
    private boolean handleUrl(Uri uri) {
        if (uri == null) {
            return false;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            return openExternal(uri);
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (PLATFORM_HOST.equals(host)) {
            return false;
        }
        return openExternal(uri);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_FILE_CHOOSER) {
            handleFileChooserResult(resultCode, data);
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void handleFileChooserResult(int resultCode, Intent data) {
        if (fileCallback == null) {
            return;
        }
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int index = 0; index < count; index += 1) {
                    results[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(results);
        fileCallback = null;
    }

    private final class PlatformClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return request != null && handleUrl(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            errorView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            progressBar.setVisibility(View.VISIBLE);
            progressBar.setProgress(0);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
            view.evaluateJavascript(BRIDGE_JS, null);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request != null && request.isForMainFrame() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                showErrorPage();
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            showErrorPage();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
            Toast.makeText(MainActivity.this, "应用进程已重启，正在重新打开", Toast.LENGTH_SHORT).show();
            recreate();
            return true;
        }
    }

    private final class PlatformChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
            progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
            }
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), REQUEST_FILE_CHOOSER);
                return true;
            } catch (ActivityNotFoundException error) {
                fileCallback = null;
                Toast.makeText(MainActivity.this, "没有可用的文件选择器", Toast.LENGTH_SHORT).show();
                return false;
            }
        }
    }

    private final class PlatformDownloadListener implements android.webkit.DownloadListener {
        @Override
        public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
            if (url == null || url.startsWith("blob:") || url.startsWith("data:")) {
                return;
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                if (mimeType != null && !mimeType.isEmpty()) {
                    request.setMimeType(mimeType);
                }
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) {
                    request.addRequestHeader("cookie", cookie);
                }
                if (userAgent != null) {
                    request.addRequestHeader("User-Agent", userAgent);
                }
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (manager == null) {
                    throw new IllegalStateException("DownloadManager unavailable");
                }
                manager.enqueue(request);
                Toast.makeText(MainActivity.this, "已开始下载，可在系统通知栏查看", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(MainActivity.this, "下载失败，请用浏览器打开本页重试", Toast.LENGTH_LONG).show();
            }
        }
    }

    private final class NativeBridge {
        @JavascriptInterface
        public void showToast(String message) {
            if (message == null) {
                return;
            }
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void saveBase64(String fileName, String base64) {
            if (base64 == null || base64.isEmpty()) {
                return;
            }
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String saved = writeToDownloads(safeName(fileName), bytes);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "已保存：" + saved, Toast.LENGTH_LONG).show());
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "保存失败，请用浏览器打开本页导出", Toast.LENGTH_LONG).show());
            }
        }
    }

    private String safeName(String fileName) {
        String fallback = "sxf-download-" + new SimpleDateFormat("yyyyMMddHHmmss", Locale.ROOT).format(new Date());
        if (fileName == null || fileName.trim().isEmpty()) {
            return fallback;
        }
        String cleaned = fileName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return cleaned.isEmpty() ? fallback : cleaned;
    }

    /** API 29+ 写入系统下载目录；更低版本写入应用自己的下载目录，避免申请存储权限。 */
    private String writeToDownloads(String fileName, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            ContentResolver resolver = getContentResolver();
            Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) {
                throw new IllegalStateException("MediaStore insert failed");
            }
            try (OutputStream output = resolver.openOutputStream(item)) {
                if (output == null) {
                    throw new IllegalStateException("MediaStore output unavailable");
                }
                output.write(bytes);
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(item, values, null, null);
            return "下载/" + fileName;
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            dir = new File(getFilesDir(), "downloads");
        }
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("download dir unavailable");
        }
        File target = new File(dir, fileName);
        try (FileOutputStream output = new FileOutputStream(target)) {
            output.write(bytes);
        }
        return target.getAbsolutePath();
    }
}
