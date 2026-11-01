import cn.sxffootball.pad.ClientPolicy;
public class ClientPolicyTest {
    private static int count;
    private static void check(boolean condition) { if(!condition) throw new AssertionError("Case " + count); count++; }
    public static void main(String[] args) {
        check(ClientPolicy.firstParty(ClientPolicy.HOME));
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
        check(ClientPolicy.VERSION_CODE == 102);
        String route = "https://www.sxffootball.cn/preview/admin/?layout=a#/tournaments/id/competition?divisionId=abc";
        check(ClientPolicy.freshPageUrl(route, 123).equals("https://www.sxffootball.cn/preview/admin/?layout=a&_sxf_reload=123#/tournaments/id/competition?divisionId=abc"));
        check(ClientPolicy.freshPageUrl(ClientPolicy.freshPageUrl(route,123),124).equals("https://www.sxffootball.cn/preview/admin/?layout=a&_sxf_reload=124#/tournaments/id/competition?divisionId=abc"));
        check(ClientPolicy.freshPageUrl("https://evil.com/#/login",125).startsWith("https://www.sxffootball.cn/preview/admin/?_sxf_reload=125"));
        check(ClientPolicy.freshPageUrl("https://www.sxffootball.cn/preview/admin/?a=%2F%26&b=1+2#/a%2Fb",126).endsWith("?a=%2F%26&b=1+2&_sxf_reload=126#/a%2Fb"));
        check(!ClientPolicy.freshPageUrl(route,123).equals(ClientPolicy.freshPageUrl(route,124)));
        System.out.println("Client policy tests passed: " + count);
    }
}
