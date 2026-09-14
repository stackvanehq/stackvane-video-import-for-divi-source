/**
 * Mirrors the server's `ImportController::classify()` in JS, for one purpose only: telling whether
 * a video already sitting in the slider is the same video as one just fetched, so the duplicate
 * check works against what the author already has, not just against the freshly pasted list. The
 * server has no way to see the slider's current children, so this half of the check has to live
 * here.
 */

const YOUTUBE_HOSTS = [ 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be' ];

const VIMEO_HOSTS = [ 'vimeo.com', 'www.vimeo.com', 'player.vimeo.com' ];

const FILE_EXTENSIONS = [ 'mp4', 'webm', 'ogv', 'ogg', 'mov' ];

/**
 * The stable identity of a video URL: which provider it belongs to, plus a key two different URLs
 * for the same video will share (a youtu.be link and a youtube.com?v= link for the same video both
 * resolve to the same key).
 *
 * @param {string} url A video URL.
 * @return {{provider: string, key: string}|null} The classification, or null if unrecognised.
 */
export const classifyUrl = ( url ) => {
	let parsed;

	try {
		parsed = new URL( url );
	} catch {
		return null;
	}

	const host = parsed.hostname.toLowerCase();
	const path = parsed.pathname;

	if ( YOUTUBE_HOSTS.includes( host ) ) {
		const id = youtubeId( parsed, host );

		return id ? { provider: 'youtube', key: `youtube:${ id }` } : null;
	}

	if ( VIMEO_HOSTS.includes( host ) ) {
		const id = vimeoId( path );

		return id ? { provider: 'vimeo', key: `vimeo:${ id }` } : null;
	}

	const extension = ( path.split( '.' ).pop() || '' ).toLowerCase();

	if ( FILE_EXTENSIONS.includes( extension ) ) {
		return { provider: 'self', key: `self:${ url.toLowerCase() }` };
	}

	return null;
};

const youtubeId = ( parsed, host ) => {
	if ( 'youtu.be' === host ) {
		const id = parsed.pathname.replace( /^\//, '' );

		return /^[A-Za-z0-9_-]{11}$/.test( id ) ? id : '';
	}
	const embedMatch = parsed.pathname.match( /\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/ );

	if ( embedMatch ) {
		return embedMatch[ 1 ];
	}
	const v = parsed.searchParams.get( 'v' );

	return v && /^[A-Za-z0-9_-]{11}$/.test( v ) ? v : '';
};

const vimeoId = ( path ) => {
	const match = path.match( /\/(\d+)(?:\/[a-z0-9]+)?\/?$/i );

	return match ? match[ 1 ] : '';
};
