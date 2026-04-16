import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AuthConfig {
    discoveryUrl: string;
    clientId: string;
    clientSecret: string;
    publicOrigin: string;
    scopes: string[];
    sessionSecret: string;
    sessionCookieName: string;
    flowCookieName: string;
    sessionTtlSeconds: number;
    cookieSecure: boolean;
}

export interface AuthenticatedViewer {
    displayName: string;
    email?: string | null;
}

interface DiscoveryDocument {
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    end_session_endpoint?: string;
}

interface FlowStatePayload {
    state: string;
    codeVerifier: string;
    expiresAt: number;
}

interface SessionPayload {
    sub: string;
    displayName: string;
    email?: string | null;
    expiresAt: number;
}

interface TokenResponse {
    access_token?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
}

interface UserInfoResponse {
    sub?: string;
    name?: string;
    email?: string;
    preferred_username?: string;
    nickname?: string;
}

interface CookieOptions {
    httpOnly?: boolean;
    path?: string;
    sameSite?: 'Lax' | 'Strict' | 'None';
    secure?: boolean;
    maxAge?: number;
    expires?: Date;
}

function parseCookieHeader(headerValue: string | undefined): Record<string, string> {
    if (!headerValue) {
        return {};
    }

    const pairs = headerValue.split(';');
    const cookies: Record<string, string> = {};
    for (const pair of pairs) {
        const separatorIndex = pair.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const rawName = pair.slice(0, separatorIndex).trim();
        const rawValue = pair.slice(separatorIndex + 1).trim();
        if (!rawName) {
            continue;
        }

        try {
            cookies[rawName] = decodeURIComponent(rawValue);
        } catch (_error) {
            cookies[rawName] = rawValue;
        }
    }

    return cookies;
}

function serialiseCookie(name: string, value: string, options: CookieOptions): string {
    const segments = [`${name}=${encodeURIComponent(value)}`];

    segments.push(`Path=${options.path ?? '/'}`);
    if (typeof options.maxAge === 'number') {
        segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
    }
    if (options.expires) {
        segments.push(`Expires=${options.expires.toUTCString()}`);
    }
    if (options.httpOnly) {
        segments.push('HttpOnly');
    }
    if (options.sameSite) {
        segments.push(`SameSite=${options.sameSite}`);
    }
    if (options.secure) {
        segments.push('Secure');
    }

    return segments.join('; ');
}

function toBase64Url(value: string): string {
    return Buffer.from(value, 'utf-8').toString('base64url');
}

function fromBase64Url(value: string): string | null {
    try {
        return Buffer.from(value, 'base64url').toString('utf-8');
    } catch (_error) {
        return null;
    }
}

function createSignature(value: string, secret: string): string {
    return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf-8');
    const rightBuffer = Buffer.from(right, 'utf-8');

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeSignedPayload<T extends object>(payload: T, secret: string): string {
    const encoded = toBase64Url(JSON.stringify(payload));
    const signature = createSignature(encoded, secret);
    return `${encoded}.${signature}`;
}

function decodeSignedPayload<T extends object>(cookieValue: string | undefined, secret: string): T | null {
    if (!cookieValue) {
        return null;
    }

    const [encoded, signature] = cookieValue.split('.');
    if (!encoded || !signature) {
        return null;
    }

    const expectedSignature = createSignature(encoded, secret);
    if (!safeEqual(signature, expectedSignature)) {
        return null;
    }

    const decoded = fromBase64Url(encoded);
    if (!decoded) {
        return null;
    }

    try {
        return JSON.parse(decoded) as T;
    } catch (_error) {
        return null;
    }
}

function redirectResponse(
    res: ServerResponse,
    location: string,
    headers: Record<string, string | string[]> = {}
): void {
    res.writeHead(302, {
        Location: location,
        ...headers
    });
    res.end();
}

function textResponse(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
}

function createRandomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
}

function createCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
}

function normaliseUserInfo(userInfo: UserInfoResponse): SessionPayload | null {
    if (typeof userInfo.sub !== 'string' || userInfo.sub.length === 0) {
        return null;
    }

    const displayName = [
        userInfo.name,
        userInfo.preferred_username,
        userInfo.nickname,
        userInfo.email,
        userInfo.sub
    ].find((value) => typeof value === 'string' && value.trim().length > 0);

    if (!displayName) {
        return null;
    }

    return {
        sub: userInfo.sub,
        displayName,
        email: typeof userInfo.email === 'string' ? userInfo.email : null,
        expiresAt: 0
    };
}

export class AuthManager {
    private readonly config: AuthConfig | null;
    private discoveryPromise: Promise<DiscoveryDocument> | null = null;

    constructor(config: AuthConfig | null) {
        this.config = config;
    }

    isEnabled(): boolean {
        return this.config !== null;
    }

    isAuthenticated(req: IncomingMessage): boolean {
        return this.getViewer(req) !== null;
    }

    getViewer(req: IncomingMessage): AuthenticatedViewer | null {
        const config = this.config;
        if (!config) {
            return null;
        }

        const cookies = parseCookieHeader(req.headers.cookie);
        const session = decodeSignedPayload<SessionPayload>(cookies[config.sessionCookieName], config.sessionSecret);
        if (!session) {
            return null;
        }

        if (session.expiresAt <= Date.now()) {
            return null;
        }

        return {
            displayName: session.displayName,
            email: session.email ?? null
        };
    }

    sendUnauthorized(res: ServerResponse): void {
        textResponse(res, 401, 'Authentication required.');
    }

    async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const config = this.config;
        if (!config) {
            textResponse(res, 404, 'Authentication is not configured.');
            return;
        }

        if (this.isAuthenticated(req)) {
            redirectResponse(res, '/');
            return;
        }

        const discovery = await this.getDiscovery();
        const state = createRandomToken(24);
        const codeVerifier = createRandomToken(48);
        const flowState: FlowStatePayload = {
            state,
            codeVerifier,
            expiresAt: Date.now() + 10 * 60 * 1000
        };

        const loginUrl = new URL(discovery.authorization_endpoint);
        loginUrl.searchParams.set('response_type', 'code');
        loginUrl.searchParams.set('client_id', config.clientId);
        loginUrl.searchParams.set('redirect_uri', this.getCallbackUrl());
        loginUrl.searchParams.set('scope', config.scopes.join(' '));
        loginUrl.searchParams.set('state', state);
        loginUrl.searchParams.set('code_challenge_method', 'S256');
        loginUrl.searchParams.set('code_challenge', createCodeChallenge(codeVerifier));

        const flowCookie = serialiseCookie(
            config.flowCookieName,
            encodeSignedPayload(flowState, config.sessionSecret),
            {
                httpOnly: true,
                sameSite: 'Lax',
                secure: config.cookieSecure,
                path: '/',
                maxAge: 10 * 60
            }
        );

        redirectResponse(res, loginUrl.toString(), { 'Set-Cookie': flowCookie });
    }

    async handleCallback(req: IncomingMessage, res: ServerResponse, currentUrl: URL): Promise<void> {
        const config = this.config;
        if (!config) {
            textResponse(res, 404, 'Authentication is not configured.');
            return;
        }

        const error = currentUrl.searchParams.get('error');
        if (error) {
            this.redirectToLoginError(res, currentUrl.searchParams.get('error_description') ?? error);
            return;
        }

        const code = currentUrl.searchParams.get('code');
        const state = currentUrl.searchParams.get('state');
        if (!code || !state) {
            this.redirectToLoginError(res, 'OIDC callback is missing required parameters.');
            return;
        }

        const cookies = parseCookieHeader(req.headers.cookie);
        const flowState = decodeSignedPayload<FlowStatePayload>(cookies[config.flowCookieName], config.sessionSecret);
        if (!flowState || flowState.expiresAt <= Date.now() || flowState.state !== state) {
            this.redirectToLoginError(res, 'The login session expired. Please try again.');
            return;
        }

        try {
            const discovery = await this.getDiscovery();
            const tokenResponse = await this.exchangeCode(discovery, code, flowState.codeVerifier);
            const sessionBase = await this.fetchUserInfo(discovery, tokenResponse.access_token);
            const sessionPayload: SessionPayload = {
                ...sessionBase,
                expiresAt: Date.now() + config.sessionTtlSeconds * 1000
            };

            const clearFlowCookie = this.clearCookie(config.flowCookieName);
            const sessionCookie = serialiseCookie(
                config.sessionCookieName,
                encodeSignedPayload(sessionPayload, config.sessionSecret),
                {
                    httpOnly: true,
                    sameSite: 'Lax',
                    secure: config.cookieSecure,
                    path: '/',
                    maxAge: config.sessionTtlSeconds
                }
            );

            redirectResponse(res, '/', {
                'Set-Cookie': [clearFlowCookie, sessionCookie]
            });
        } catch (errorValue) {
            const message = errorValue instanceof Error ? errorValue.message : 'Failed to complete login.';
            this.redirectToLoginError(res, message);
        }
    }

    handleLogout(res: ServerResponse): void {
        const config = this.config;
        if (!config) {
            redirectResponse(res, '/');
            return;
        }

        redirectResponse(res, '/', {
            'Set-Cookie': [
                this.clearCookie(config.sessionCookieName),
                this.clearCookie(config.flowCookieName)
            ]
        });
    }

    private clearCookie(name: string): string {
        return serialiseCookie(name, '', {
            httpOnly: true,
            sameSite: 'Lax',
            secure: this.config?.cookieSecure ?? false,
            path: '/',
            maxAge: 0,
            expires: new Date(0)
        });
    }

    private getCallbackUrl(): string {
        const config = this.config;
        if (!config) {
            throw new Error('Authentication is not configured.');
        }

        return new URL('/auth/callback', config.publicOrigin).toString();
    }

    private redirectToLoginError(res: ServerResponse, message: string): void {
        const target = new URL('/', this.config?.publicOrigin ?? 'http://localhost');
        target.searchParams.set('auth_error', message);
        redirectResponse(res, `${target.pathname}${target.search}`);
    }

    private async getDiscovery(): Promise<DiscoveryDocument> {
        const config = this.config;
        if (!config) {
            throw new Error('Authentication is not configured.');
        }

        if (!this.discoveryPromise) {
            this.discoveryPromise = fetch(config.discoveryUrl)
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to load Authentik discovery document (${response.status}).`);
                    }
                    return (await response.json()) as DiscoveryDocument;
                })
                .then((document) => {
                    if (
                        typeof document.authorization_endpoint !== 'string' ||
                        typeof document.token_endpoint !== 'string' ||
                        typeof document.userinfo_endpoint !== 'string'
                    ) {
                        throw new Error('Authentik discovery document is missing required OIDC endpoints.');
                    }
                    return document;
                });
        }

        return this.discoveryPromise;
    }

    private async exchangeCode(
        discovery: DiscoveryDocument,
        code: string,
        codeVerifier: string
    ): Promise<{ access_token: string }> {
        const config = this.config;
        if (!config) {
            throw new Error('Authentication is not configured.');
        }

        const payload = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: this.getCallbackUrl(),
            code,
            code_verifier: codeVerifier
        });

        const response = await fetch(discovery.token_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: payload.toString()
        });

        const tokenResponse = (await response.json()) as TokenResponse;
        if (!response.ok || typeof tokenResponse.access_token !== 'string') {
            const errorDescription =
                tokenResponse.error_description ||
                tokenResponse.error ||
                `OIDC token exchange failed with status ${response.status}.`;
            throw new Error(errorDescription);
        }

        return { access_token: tokenResponse.access_token };
    }

    private async fetchUserInfo(discovery: DiscoveryDocument, accessToken: string): Promise<SessionPayload> {
        const response = await fetch(discovery.userinfo_endpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load user profile from Authentik (${response.status}).`);
        }

        const userInfo = (await response.json()) as UserInfoResponse;
        const normalised = normaliseUserInfo(userInfo);
        if (!normalised) {
            throw new Error('Authentik user profile is missing required identity fields.');
        }

        return normalised;
    }
}
