import * as util from '../js/streaming-client/built/util.js';
import { Client } from '../js/streaming-client/built/client.js';
import { ClientAPI } from './client-api.js';
import { configureInput } from './borg-input.js';
import { configureRTC } from './codecs.js';
import { Ephemeral, IBorgNode } from './ephemeral.js';
import { getIceServers, updateIceServers, getConnectionType } from './ice.js';
import { Session } from './session.js';

const params = new URLSearchParams(window.location.search);
export const ACCESS_KEY = params.get('key');
export const GAME_URI = params.get('game');

interface IGameEntry {
    uri: string;
    title: string;
}

interface IOfferEnvelope {
    offer?: RTCSessionDescriptionInit;
    games?: IGameEntry[];
}

export function parseOffer(node: IBorgNode): { sdp: RTCSessionDescriptionInit, games: IGameEntry[] } {
    const session = JSON.parse(node.peer_connection_offer);
    const raw = JSON.parse(session.Offer as string);
    if (raw.offer !== undefined) {
        // Extended format: {offer: <RTCSessionDescriptionInit>, games: [...]}
        return {
            sdp: (raw as IOfferEnvelope).offer!,
            games: (raw as IOfferEnvelope).games ?? [],
        };
    }
    // Plain SDP format (legacy / other listeners)
    return { sdp: raw as RTCSessionDescriptionInit, games: [] };
}

export async function connect(
    element: HTMLVideoElement,
    statusEl: HTMLElement,
    exe: string,
    sessionId: string,
    node: IBorgNode,
    timeout: Promise<never>,
) {
    const { sdp } = parseOffer(node);
    const signalFactory = () => new Ephemeral(null, ACCESS_KEY);
    const clientApi = new ClientAPI();
    const iceServers = getIceServers();

    return new Promise<number | Error>((resolve) => {
        let stall = 0;

        const client = new Client(clientApi, signalFactory, element, (event: any) => {
            switch (event.type) {
            case 'exit':
                document.removeEventListener('keydown', hotkeys, true);
                resolve(event.code);
                break;
            case 'stall':
                if (stall !== 0) break;
                stall = setTimeout(() => {
                    if (!client.exited())
                        client.destroy(Client.StopCodes.CONNECTION_TIMEOUT);
                }, 30000);
                break;
            case 'frame':
                if (stall !== 0) { clearTimeout(stall); stall = 0; }
                break;
            case 'status':
                statusEl.innerText = event.msg?.str ?? '';
                break;
            }
        }, async (name: string, channel: RTCDataChannel) => {
            if (name !== 'control') return;
            await Session.waitForCommandRequest(channel);
            channel.send(JSON.stringify({ uri: 'borg://exe/' + exe, sessionId }));
            await Session.waitForCommandRequest(channel);
        }, iceServers);

        (client as any).configureRTC = configureRTC;
        configureInput(client.input);

        const hotkeys = (event: KeyboardEvent) => {
            event.preventDefault();
            if (event.code === 'Backquote' && event.ctrlKey && event.altKey)
                client.destroy(0);
            else if (event.code === 'Enter' && event.ctrlKey && event.altKey)
                util.toggleFullscreen(client.element);
        };
        document.addEventListener('keydown', hotkeys, true);

        Promise.race([timeout, client.connect(node.session_id, sdp, {
            encoder_bitrate: parseInt(localStorage.getItem('encoder_bitrate') ?? '2') || 2,
        })]).catch((e: any) => {
            if (e?.message === 'cancelled') client.destroy(0);
            resolve(e);
        });
    });
}
