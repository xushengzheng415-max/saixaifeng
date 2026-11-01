package cn.sxffootball.pad;

import java.net.URI;

public final class ClientPolicy {
    public static final String HOME = "https://www.sxffootball.cn/preview/admin/#/login";
    public static final String UPDATE_FEED = "https://www.sxffootball.cn/desktop/android/latest.json";
    public static final String PACKAGE = "cn.sxffootball.pad.preview";
    public static final int VERSION_CODE = 102;
    public static final String VERSION = "0.1.2";
    public static String freshPageUrl(String value, long stamp) {
        URI uri = URI.create(firstParty(value) ? value : HOME);
        StringBuilder query = new StringBuilder();
        if (uri.getRawQuery() != null) for (String part : uri.getRawQuery().split("&")) {
            if (!part.isEmpty() && !part.equals("_sxf_reload") && !part.startsWith("_sxf_reload=")) query.append(part).append('&');
        }
        query.append("_sxf_reload=").append(stamp);
        String fragment = uri.getRawFragment();
        return uri.getScheme() + "://" + uri.getRawAuthority() + (uri.getRawPath().isEmpty() ? "/" : uri.getRawPath())
            + "?" + query + (fragment == null ? "" : "#" + fragment);
    }
    public static boolean firstParty(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && "www.sxffootball.cn".equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }
    public static boolean updateUrl(String value) {
        try {
            URI uri = new URI(value);
            return firstParty(value) && uri.getPath().startsWith("/desktop/android/")
                && uri.getPath().endsWith(".apk") && !uri.normalize().getPath().contains("..")
                && uri.normalize().getPath().startsWith("/desktop/android/");
        } catch (Exception ignored) { return false; }
    }
    public static boolean webLink(String value) {
        try { return "https".equalsIgnoreCase(new URI(value).getScheme()); }
        catch (Exception ignored) { return false; }
    }
    public static String filename(String value) {
        String name = (value == null ? "导出文件" : value).replaceAll("[\\\\/\\p{Cntrl}]", "_").trim();
        return name.isEmpty() ? "导出文件" : name.substring(0, Math.min(name.length(), 120));
    }
}
