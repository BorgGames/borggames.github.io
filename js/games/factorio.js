import {SYNC} from "../onedrive.js";

const LOGIN = 'https://borg-ephemeral.azurewebsites.net/cors/factorio/login';
export const LOCAL_DATA = "Games/Factorio";
const LOCAL_DATA_URL = `special/approot:/${LOCAL_DATA}`;
const PLAYER_DATA_URL = LOCAL_DATA_URL + "/player-data.json";

const playFull = document.getElementById('factorio');
const loginForm = document.getElementById('factorio-login-form');
const uname = loginForm.elements["username"];
const pwd = loginForm.elements["password"];
const token = loginForm.elements["token"];

const creds = JSON.parse(localStorage.getItem('factorio-creds'));
if (creds) {
    uname.value = creds.user;
    pwd.value = creds.pass;
    token.value = creds.token;
}

// https://auth.factorio.com/api-login
export async function login(user, pwd, token) {
    const response = await fetch(LOGIN, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            username: user,
            password: pwd,
            token: token,
            api_version: 4,
            require_game_ownership: true,
        }),
    });
    const json = await response.json();
    if (!response.ok || !json.token)
        throw new Error(json.message);

    let playerData = await getPlayerData();
    playerData = playerData || {};
    playerData["service-username"] = json.username || user;
    playerData["service-token"] = json.token;

    const putResponse = await SYNC.makeRequest(PLAYER_DATA_URL + ':/content', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(playerData)
    });

    if (!putResponse.ok)
        throw new Error(`Failed to save player data: HTTP ${putResponse.status}: ${putResponse.statusText}`);

    localStorage.removeItem('factorio-creds');

    console.log('Factorio logged in');

    return json.token;
}

async function getPlayerData() {
    const response = await SYNC.download(PLAYER_DATA_URL);
    if (response === null)
        return {};
    return await response.json();
}

export async function loginRequired() {
    try {
        var player = await getPlayerData();
    } catch (e){
        console.error('loginRequired', e);
        return true;
    }
    const user = player["service-username"];
    const token = player["service-token"];
    const required = !user || !token;
    if (!required)
        localStorage.removeItem('factorio-creds');
    return required;
}

let loginCheck = null;

const playFactorio = document.getElementById('factorio-play');
playFactorio.addEventListener('click', expand);

async function expand() {
    playFactorio.style.display = 'none';
    document.getElementById('factorio-login').style.display = 'inline-block';
    await checkLogin();
}
if (creds)
    expand();

playFactorio.addEventListener('mouseenter', checkLogin);

function credsEntered() {
    if (!uname.validity.valid)
        return false;
    if (pwd.validity.valid)
        return true;
    return token.validity.valid && uname.value.indexOf('@') < 0;
}

for(const input of [uname, pwd, token]) {
    input.addEventListener('input', () => {
        playFull.disabled = !credsEntered();
        localStorage.setItem('factorio-creds', JSON.stringify({
            user: uname.value,
            pass: pwd.value,
            token: token.value,
        }));
    });
}

async function checkLogin() {
    if (loginCheck)
        return await loginCheck;

    loginCheck = (async () => {
        playFull.disabled = !credsEntered();
        const needsLogin = await loginRequired();
        playFull.disabled = needsLogin && !credsEntered();
        console.log('Factorio needs login', needsLogin);
        loginForm.classList.toggle('needs-login', needsLogin);
    })();
    return await loginCheck;
}

