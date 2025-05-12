const exePrefix = '//exe/';

export class GameID {
    static tryGetExe(uriString: string) {
        const uri = new URL(uriString);
        if (uri.protocol !== "borg:" || uri.host !== "exe" || !uri.pathname.startsWith('/'))
            return null;
        return uri.pathname.substring(1);
    }
}