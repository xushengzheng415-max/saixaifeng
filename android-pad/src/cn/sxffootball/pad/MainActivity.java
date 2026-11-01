package cn.sxffootball.pad;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.*;
import android.provider.Settings;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;
    private FrameLayout content;
    private LinearLayout errorPanel;
    private ProgressBar progress;
    private Button more;
    private ValueCallback<Uri[]> upload;
    private byte[] exportBytes;
    private String bridgeNonce = "", failedUrl = ClientPolicy.HOME, updateUrl = "", updateVersion = "", updateNotes = "";
    private volatile boolean checking = false;
    private boolean updatePromptShown;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private static final int PICK_FILE = 11, SAVE_EXPORT = 12;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled(false);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, () -> back());
        LinearLayout bar = new LinearLayout(this); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(dp(10), 0, dp(10), 0); bar.setBackgroundColor(Color.rgb(244,247,245));
        TextView title = new TextView(this); title.setText("赛小蜂足球 · 平板测试版"); title.setTextColor(Color.rgb(18,75,48)); title.setTextSize(14);
        bar.addView(title, new LinearLayout.LayoutParams(0, dp(44), 1)); title.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(button("返回", () -> back())); bar.addView(button("刷新", () -> reload())); more = button("更多", () -> menu()); bar.addView(more);
        root.addView(bar); progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); root.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));
        content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        createWeb(); createErrorPanel();
        if (state == null || web.restoreState(state) == null) web.loadUrl(ClientPolicy.freshPageUrl(ClientPolicy.HOME, System.currentTimeMillis()));
        checkUpdates(false);
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private Button button(String text, Runnable action) {
        Button b = new Button(this); b.setText(text); b.setTextSize(12); b.setMinWidth(dp(60)); b.setMinimumWidth(dp(60));
        b.setAllCaps(false); b.setOnClickListener(v -> action.run()); b.setLayoutParams(new LinearLayout.LayoutParams(-2, dp(44))); return b;
    }
    private void createWeb() {
        web = new WebView(this); content.addView(web, new FrameLayout.LayoutParams(-1,-1));
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSafeBrowsingEnabled(true); settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true); settings.setBuiltInZoomControls(false); settings.setTextZoom(100);
        settings.setUserAgentString(settings.getUserAgentString() + " SxfFootballPad/" + ClientPolicy.VERSION);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new ExportBridge(), "SxfPadExport");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!request.isForMainFrame()) return !ClientPolicy.webLink(url);
                if (ClientPolicy.firstParty(url)) return false;
                if (request.hasGesture()) external(url); return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                bridgeNonce = UUID.randomUUID().toString(); if (errorPanel != null) errorPanel.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush(); progress.setVisibility(View.GONE);
                view.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
                if (ClientPolicy.firstParty(url)) {
                    view.evaluateJavascript("document.documentElement.setAttribute('data-sxf-pad-client','');document.documentElement.setAttribute('data-tablet-landscape','');window.dispatchEvent(new CustomEvent('sxf-tablet-layout-change',{detail:{active:true}}));", null);
                    installExportHandler();
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError(request.getUrl().toString());
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError(request.getUrl().toString());
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); showError(ClientPolicy.HOME); }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                content.removeView(view); view.destroy(); web = null; showError(ClientPolicy.HOME); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!ClientPolicy.firstParty(view.getUrl())) return false;
                if (upload != null) upload.onReceiveValue(null); upload = callback;
                try { Intent intent = params.createIntent(); intent.addCategory(Intent.CATEGORY_OPENABLE); startActivityForResult(intent, PICK_FILE); }
                catch (Exception ignored) { upload.onReceiveValue(null); upload = null; toast("无法打开文件选择器"); }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onConsoleMessage(ConsoleMessage message) { return true; }
        });
        web.setDownloadListener((url, agent, disposition, mime, size) -> {
            if (ClientPolicy.webLink(url)) {
                try {
                    android.app.DownloadManager.Request r = new android.app.DownloadManager.Request(Uri.parse(url));
                    r.setTitle(ClientPolicy.filename(URLUtil.guessFileName(url, disposition, mime))); r.setNotificationVisibility(1);
                    if (ClientPolicy.firstParty(url)) { String cookie = CookieManager.getInstance().getCookie(url); if (cookie != null) r.addRequestHeader("Cookie", cookie); }
                    r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, ClientPolicy.filename(URLUtil.guessFileName(url, disposition, mime)));
                    ((android.app.DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r); toast("已加入下载，请查看系统通知");
                } catch (Exception ignored) { toast("下载未开始，请在浏览器中打开"); }
            }
        });
    }
    private void createErrorPanel() {
        errorPanel = new LinearLayout(this); errorPanel.setOrientation(LinearLayout.VERTICAL); errorPanel.setGravity(Gravity.CENTER); errorPanel.setBackgroundColor(Color.rgb(244,247,245));
        TextView text = new TextView(this); text.setText("暂时无法连接，请检查网络"); text.setTextSize(18); errorPanel.addView(text);
        errorPanel.addView(button("重新连接", () -> reload())); content.addView(errorPanel, new FrameLayout.LayoutParams(-1,-1)); errorPanel.setVisibility(View.GONE);
    }
    private void showError(String url) { failedUrl = ClientPolicy.firstParty(url) ? url : ClientPolicy.HOME; if (errorPanel != null) { errorPanel.setVisibility(View.VISIBLE); errorPanel.bringToFront(); } progress.setVisibility(View.GONE); }
    private void reload() {
        if (web == null) { createWeb(); errorPanel.bringToFront(); }
        String target = ClientPolicy.firstParty(web.getUrl()) ? web.getUrl() : failedUrl;
        errorPanel.setVisibility(View.GONE);
        web.stopLoading();
        // Clear HTTP resources only: cookies and DOM/localStorage sessions remain intact.
        web.clearCache(true);
        web.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        java.util.Map<String,String> headers = new java.util.HashMap<>();
        headers.put("Cache-Control", "no-cache, no-store, max-age=0"); headers.put("Pragma", "no-cache");
        web.loadUrl(ClientPolicy.freshPageUrl(target, System.currentTimeMillis()), headers);
    }
    private void back() { if (web != null && web.canGoBack()) web.goBack(); else new AlertDialog.Builder(this).setMessage("退出赛小蜂足球？").setNegativeButton("取消", null).setPositiveButton("退出", (d,w) -> finish()).show(); }
    @Override public void onBackPressed() { back(); }
    private void external(String url) {
        if (!ClientPolicy.webLink(url) && !url.startsWith("weixin://")) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { toast("没有可打开此链接的应用"); }
    }
    private void menu() {
        String[] items = {updateUrl.isEmpty() ? "检查更新" : "发现新版本 " + updateVersion, "在浏览器打开", "应用信息"};
        new AlertDialog.Builder(this).setTitle("赛小蜂足球 " + ClientPolicy.VERSION).setItems(items, (d,w) -> {
            if (w == 0) { if (!updateUrl.isEmpty()) confirmUpdate(); else checkUpdates(true); }
            else if (w == 1) external(web != null && ClientPolicy.firstParty(web.getUrl()) ? web.getUrl() : ClientPolicy.HOME);
            else new AlertDialog.Builder(this).setTitle("平板测试版 " + ClientPolicy.VERSION).setMessage("当前连接测试后台，数据与官网共用。\n页面更新联网生效；安装包升级将在此提示。").setPositiveButton("确定",null).show();
        }).show();
    }
    private void checkUpdates(boolean manual) {
        if (checking) return; checking = true;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection)new URL(ClientPolicy.UPDATE_FEED + "?t=" + System.currentTimeMillis()).openConnection();
                c.setConnectTimeout(5000); c.setReadTimeout(5000); c.setInstanceFollowRedirects(false);
                c.setUseCaches(false); c.setRequestProperty("Cache-Control", "no-cache");
                try {
                    if (c.getResponseCode() != 200) throw new IOException("feed unavailable");
                    ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int n;
                    try (InputStream in = c.getInputStream()) { while ((n = in.read(buffer)) != -1) { if (out.size() + n > 65536) throw new IOException("feed too large"); out.write(buffer,0,n); } }
                    JSONObject feed = new JSONObject(out.toString("UTF-8"));
                    if (!ClientPolicy.PACKAGE.equals(feed.optString("packageId")) || !"android".equals(feed.optString("platform"))) throw new IOException("wrong channel");
                    boolean newer = feed.optInt("versionCode") > ClientPolicy.VERSION_CODE;
                    String target = feed.optString("downloadUrl"); if (newer && !ClientPolicy.updateUrl(target)) throw new IOException("invalid update link");
                    String version = feed.optString("version");
                    String notes = feed.optString("notes");
                    ui.post(() -> {
                        if (isFinishing()) return;
                        if (newer) {
                            updateUrl = target; updateVersion = version; updateNotes = notes == null ? "" : notes; more.setText("更多 · 更新");
                            // 启动检查发现新版本也弹出；同一会话只自动弹一次，手动检查仍可再开。
                            if (manual || !updatePromptShown) { updatePromptShown = true; confirmUpdate(); }
                        } else if (manual) toast("当前已是最新版本");
                    });
                } finally { c.disconnect(); }
            } catch (Exception ignored) { if (manual) ui.post(() -> toast("暂时无法检查更新，请稍后重试")); }
            finally { checking = false; }
        }, "sxf-update-check").start();
    }
    private void confirmUpdate() {
        String detail = "将后台下载安装包，完成后打开系统通知按提示安装；保留本机登录资料，无需卸载重装。";
        if (updateNotes != null && !updateNotes.trim().isEmpty()) detail = updateNotes.trim() + "\n\n" + detail;
        new AlertDialog.Builder(this).setTitle("发现新版本 " + updateVersion).setMessage(detail)
            .setNegativeButton("稍后", null).setPositiveButton("立即更新", (d,w) -> downloadUpdate()).show();
    }
    private void downloadUpdate() {
        if (updateUrl.isEmpty() || !ClientPolicy.updateUrl(updateUrl)) return;
        try {
            android.app.DownloadManager.Request r = new android.app.DownloadManager.Request(Uri.parse(updateUrl));
            r.setTitle("赛小蜂足球 " + updateVersion);
            r.setDescription("正在下载平板更新包");
            r.setMimeType("application/vnd.android.package-archive");
            r.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, ClientPolicy.filename("SxfFootball-Pad-" + updateVersion + "-preview.apk"));
            ((android.app.DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
            toast("已开始后台下载，完成后打开通知安装");
        } catch (Exception ignored) { external(updateUrl); }
    }
    private void installExportHandler() {
        String nonce = JSONObject.quote(bridgeNonce);
        web.evaluateJavascript("(()=>{if(window.__sxfPadExport)return;window.__sxfPadExport=true;const send=(url,name)=>fetch(url).then(r=>r.blob()).then(b=>{if(b.size>25*1024*1024)throw Error('large');const reader=new FileReader();reader.onload=()=>SxfPadExport.save(String(reader.result).split(',')[1],b.type||'application/octet-stream',name,"+nonce+");reader.readAsDataURL(b)});document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[download]');if(a&&/^(blob:|data:)/.test(a.href)){e.preventDefault();send(a.href,a.download||'导出文件')}},true);const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&/^(blob:|data:)/.test(this.href)){send(this.href,this.download);return}return click.call(this)}})()", null);
    }
    public final class ExportBridge {
        @JavascriptInterface public void save(String encoded, String mime, String filename, String nonce) {
            if (encoded == null || encoded.length() > 35*1024*1024 || !bridgeNonce.equals(nonce)) return;
            ui.post(() -> {
                if (web == null || !ClientPolicy.firstParty(web.getUrl()) || !bridgeNonce.equals(nonce) || exportBytes != null) return;
                try {
                    exportBytes = Base64.decode(encoded, Base64.DEFAULT); if (exportBytes.length > 25*1024*1024) { exportBytes = null; toast("文件过大，请用浏览器导出"); return; }
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime != null && mime.matches("[\\w.+-]+/[\\w.+-]+") ? mime : "application/octet-stream");
                    intent.putExtra(Intent.EXTRA_TITLE, ClientPolicy.filename(filename)); startActivityForResult(intent, SAVE_EXPORT);
                } catch (Exception ignored) { exportBytes = null; toast("无法保存，请用浏览器导出"); }
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if (request == PICK_FILE && upload != null) { upload.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data)); upload = null; }
        if (request == SAVE_EXPORT) {
            byte[] bytes = exportBytes; exportBytes = null;
            if (result == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) { if (out == null) throw new IOException(); out.write(bytes); toast("文件已保存"); }
                catch (Exception ignored) { toast("保存失败，请重新导出"); }
            }
        }
    }
    private void toast(String text) { Toast.makeText(this,text,Toast.LENGTH_SHORT).show(); }
    @Override protected void onSaveInstanceState(Bundle out) { if (web != null) web.saveState(out); super.onSaveInstanceState(out); }
    @Override protected void onPause() { if (web != null) { web.onPause(); CookieManager.getInstance().flush(); } super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() { if (upload != null) upload.onReceiveValue(null); exportBytes = null; if (web != null) { web.removeJavascriptInterface("SxfPadExport"); content.removeView(web); web.destroy(); } super.onDestroy(); }
}
