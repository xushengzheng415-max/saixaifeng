import cn.sxffootball.pad.ClientPolicy;
public class ClientPolicyTest {
    private static int count;
    private static void check(boolean condition) { if(!condition) throw new AssertionError("Case " + count); count++; }
    public static void main(String[] args) {
        check(ClientPolicy.firstParty(ClientPolicy.HOME_PREVIEW));
        check(ClientPolicy.firstParty(ClientPolicy.HOME_PRODUCTION));
        check(ClientPolicy.home(true).equals(ClientPolicy.HOME_PREVIEW));
        check(ClientPolicy.home(false).equals(ClientPolicy.HOME_PRODUCTION));
        check(ClientPolicy.channelValid(ClientPolicy.CHANNEL_PREVIEW));
        check(ClientPolicy.channelValid(ClientPolicy.CHANNEL_PRODUCTION));
        check(!ClientPolicy.channelValid("test"));
        check(!ClientPolicy.channelValid(null));
        check(!ClientPolicy.firstParty("http://www.sxffootball.cn/"));
        check(!ClientPolicy.firstParty("https://www.sxffootball.cn.evil.com/"));
        check(!ClientPolicy.firstParty("https://www.sxffootball.cn@evil.com/"));
        check(!ClientPolicy.firstParty("https://www.sxffootball.cn:444/"));
        check(!ClientPolicy.firstParty("file:///sdcard/test.html"));
        check(!ClientPolicy.firstParty("javascript:alert(1)"));
        check(ClientPolicy.updateUrl("https://www.sxffootball.cn/desktop/android/app.apk"));
        check(!ClientPolicy.updateUrl("https://www.sxffootball.cn/desktop/android/../../evil.apk"));
        check(!ClientPolicy.updateUrl("https://evil.com/desktop/android/app.apk"));
        check(!ClientPolicy.updateUrl("https://www.sxffootball.cn/desktop/windows/app.exe"));
        check(!ClientPolicy.webLink("intent://malicious/"));
        check(!ClientPolicy.webLink("content://private/"));
        check(!ClientPolicy.filename("../恶意\\file\n.pdf").contains("/"));
        check(!ClientPolicy.filename("../恶意\\file\n.pdf").contains("\\"));
        check(ClientPolicy.VERSION_CODE == 103);
        String route = "https://www.sxffootball.cn/preview/admin/?layout=a#/tournaments/id/competition?divisionId=abc";
        check(ClientPolicy.freshPageUrl(route, 123, ClientPolicy.HOME_PREVIEW).equals("https://www.sxffootball.cn/preview/admin/?layout=a&_sxf_reload=123#/tournaments/id/competition?divisionId=abc"));
        check(ClientPolicy.freshPageUrl(ClientPolicy.freshPageUrl(route,123,ClientPolicy.HOME_PREVIEW),124,ClientPolicy.HOME_PREVIEW).equals("https://www.sxffootball.cn/preview/admin/?layout=a&_sxf_reload=124#/tournaments/id/competition?divisionId=abc"));
        check(ClientPolicy.freshPageUrl("https://evil.com/#/login",125,ClientPolicy.HOME_PRODUCTION).startsWith("https://www.sxffootball.cn/admin/?_sxf_reload=125"));
        check(ClientPolicy.freshPageUrl("https://evil.com/#/login",125,ClientPolicy.HOME_PREVIEW).startsWith("https://www.sxffootball.cn/preview/admin/?_sxf_reload=125"));
        check(ClientPolicy.freshPageUrl("https://evil.com/#/login",125,"https://evil.com/").startsWith("https://www.sxffootball.cn/preview/admin/?_sxf_reload=125"));
        check(ClientPolicy.freshPageUrl("https://www.sxffootball.cn/preview/admin/?a=%2F%26&b=1+2#/a%2Fb",126,ClientPolicy.HOME_PREVIEW).endsWith("?a=%2F%26&b=1+2&_sxf_reload=126#/a%2Fb"));
        check(!ClientPolicy.freshPageUrl(route,123,ClientPolicy.HOME_PREVIEW).equals(ClientPolicy.freshPageUrl(route,124,ClientPolicy.HOME_PREVIEW)));
        System.out.println("Client policy tests passed: " + count);
    }
}
