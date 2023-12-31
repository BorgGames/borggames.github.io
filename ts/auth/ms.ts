﻿declare var msal: any;

export function makeApp(clientID: string) {
    const msalConfig = {
        auth: {
            clientId: clientID,
            authority: 'https://login.microsoftonline.com/consumers',
        },
        cache: {
            cacheLocation: 'localStorage'
        }
    };
    
    return new msal.PublicClientApplication(msalConfig);
}
export async function login(clientApp: any, scopes: string[], loud?: boolean, partial?: { account?: any }) {
    partial = partial || {};
    loud = loud || false;
    const loginRequest = { scopes };

    const redirectResult = await clientApp.handleRedirectPromise();
    console.debug('redirectResult', redirectResult);
    if (redirectResult && window.location.hash.length > 0) {
        try {
            const hashQuery = new URLSearchParams(window.location.hash.substring(1));
            hashQuery.delete('code');
            hashQuery.delete('client_info');
            window.history.replaceState({}, document.title,
                window.location.pathname + window.location.search + '#' + hashQuery.toString());
        } catch (e){
            console.warn('Failed to parse hash', e);
        }
    }

    if (!clientApp.getActiveAccount()) {
        const currentAccounts = clientApp.getAllAccounts();
        if (currentAccounts.length !== 0) {
            if (currentAccounts.length > 1)
                console.warn('More than one account detected, logging in with the first account');
            clientApp.setActiveAccount(currentAccounts[0]);
            console.log('There is an active account');
        } else {
            if (!loud) {
                console.log('No active accounts, not logging in');
                return null;
            }
            console.log('No active accounts, logging in');
            try {
                const loginResponse = await clientApp.loginRedirect(loginRequest);
            } catch (err) {
                if (err instanceof msal.InteractionRequiredAuthError) {
                    document.write('Sign in required: session expired');
                } else {
                    throw err;
                }
            }
            const newAccounts = clientApp.getAllAccounts();
            console.log('got ' + newAccounts.length + ' accounts');
            clientApp.setActiveAccount(newAccounts[0]);
        }
    } else {
        console.debug('using existing account');
    }

    partial.account = clientApp.getActiveAccount();

    const cooldownKey = 'ms-login-cooldown-' + clientApp.config.auth.clientId;

    let tokenResponse;
    try {
        tokenResponse = await clientApp.acquireTokenSilent(loginRequest);
    } catch (err) {
        if (err instanceof msal.InteractionRequiredAuthError) {
            if (!loud) {
                console.log('interactive login required');
                return null;
            }
            tokenResponse = await clientApp.acquireTokenRedirect(loginRequest);
        } else if (err instanceof msal.BrowserAuthError && (<any>err).errorCode === 'monitor_window_timeout'
            && +localStorage.getItem(cooldownKey)! < new Date().getTime()) {
            if (!loud) {
                console.log('interactive login required');
                return null;
            }
            localStorage.setItem(cooldownKey, String(new Date().getTime() + 90 * 1000));
            tokenResponse = await clientApp.acquireTokenRedirect(loginRequest);
        } else {
            throw err;
        }
    }

    localStorage.removeItem(cooldownKey);

    return tokenResponse.accessToken;
}