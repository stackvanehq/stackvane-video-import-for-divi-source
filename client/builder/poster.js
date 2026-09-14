/**
 * Making a poster image out of a video file, in the browser.
 *
 * Divi's own "Generate From Video" button cannot do this. Its endpoint
 * (`/divi/v1/module-data/video/thumbnail`) resolves oEmbed providers only: read
 * `VideoSlideThumbnailController::get_video_thumbnail()` and there are three branches, for an
 * already-known image, for an oEmbed provider, and for a YouTube URL. A self-hosted MP4 matches
 * none of them and comes back empty. YouTube and Vimeo already get their thumbnail at import time,
 * so this exists for the one case nothing else covers: local files.
 *
 * The frame is grabbed with a canvas, which browsers only allow on a same-origin video. Media
 * Library files are same origin, so they work. A video from another site taints the canvas and
 * throws, which is caught and reported as "no poster" rather than failing the import.
 */

/** Give up on a video that never loads, so one bad file cannot stall a whole import. */
const LOAD_TIMEOUT_MS = 15000;

/** 0 is often a black frame, so a moment in is a better first impression. */
const SEEK_SECONDS = 1;

const JPEG_QUALITY = 0.82;

/**
 * Draws one frame of a video into a JPEG blob.
 *
 * @param {string} url The video URL.
 * @return {Promise<Blob>} The frame.
 */
export const captureFrame = ( url ) =>
	new Promise( ( resolve, reject ) => {
		const video = document.createElement( 'video' );
		let settled = false;

		const finish = ( fn, value ) => {
			if ( settled ) {
				return;
			}
			settled = true;
			clearTimeout( timer );
			video.removeAttribute( 'src' );
			video.load();
			fn( value );
		};

		const timer = setTimeout(
			() => finish( reject, new Error( 'timeout' ) ),
			LOAD_TIMEOUT_MS
		);

		video.muted = true;
		video.playsInline = true;
		video.preload = 'metadata';
		// Asks for CORS headers. A cross-origin file without them fails to load here, which is the
		// clean failure; without this it would load and then throw on drawImage instead.
		video.crossOrigin = 'anonymous';

		video.onerror = () => finish( reject, new Error( 'load' ) );

		video.onloadedmetadata = () => {
			const duration = Number.isFinite( video.duration ) ? video.duration : 0;

			video.currentTime = duration > SEEK_SECONDS ? SEEK_SECONDS : duration / 2 || 0;
		};

		video.onseeked = () => {
			try {
				const canvas = document.createElement( 'canvas' );

				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;

				if ( ! canvas.width || ! canvas.height ) {
					finish( reject, new Error( 'no-dimensions' ) );

					return;
				}

				canvas.getContext( '2d' ).drawImage( video, 0, 0, canvas.width, canvas.height );

				// Throws a SecurityError on a tainted canvas, which is the cross-origin case.
				canvas.toBlob(
					( blob ) => ( blob ? finish( resolve, blob ) : finish( reject, new Error( 'blob' ) ) ),
					'image/jpeg',
					JPEG_QUALITY
				);
			} catch ( e ) {
				finish( reject, e );
			}
		};

		video.src = url;
	} );

/**
 * Looks for a poster this plugin already made for the same video.
 *
 * WordPress derives an attachment's slug from its filename, and `posterName()` is deterministic, so
 * the same video always asks for the same slug. Finding one means an earlier import already
 * generated it: reuse it rather than capturing, uploading, and leaving a duplicate behind.
 *
 * @param {string} name     The poster filename.
 * @param {string} mediaUrl Core's wp/v2/media route.
 * @param {string} nonce    A wp_rest nonce.
 * @return {Promise<string>} An existing poster URL, or ''.
 */
export const findExistingPoster = ( name, mediaUrl, nonce ) => {
	const slug = name.replace( /\.[^.]+$/, '' );
	const url = `${ mediaUrl }?slug=${ encodeURIComponent( slug ) }&media_type=image&per_page=1&_fields=source_url`;

	return fetch( url, { headers: { 'X-WP-Nonce': nonce || '' } } )
		.then( ( res ) => ( res.ok ? res.json() : [] ) )
		.then( ( list ) => ( Array.isArray( list ) && list[ 0 ]?.source_url ? list[ 0 ].source_url : '' ) )
		// A failed lookup only means "generate it", never "fail the import".
		.catch( () => '' );
};

/**
 * Uploads a poster to the Media Library and returns its URL.
 *
 * @param {Blob}   blob     The image.
 * @param {string} name     A filename to store it under.
 * @param {string} mediaUrl Core's wp/v2/media route.
 * @param {string} nonce    A wp_rest nonce.
 * @return {Promise<string>} The uploaded image URL.
 */
export const uploadPoster = ( blob, name, mediaUrl, nonce ) => {
	const form = new FormData();

	form.append( 'file', blob, name );

	// No Content-Type header: the browser has to set the multipart boundary itself.
	return fetch( mediaUrl, {
		method: 'POST',
		headers: { 'X-WP-Nonce': nonce || '' },
		body: form,
	} ).then( ( res ) =>
		res.json().then( ( data ) => {
			if ( ! res.ok ) {
				throw new Error( data?.message || 'upload failed' );
			}

			return data.source_url || '';
		} )
	);
};

/**
 * A filename for the poster, derived from the video's own.
 *
 * @param {string} url The video URL.
 * @return {string} A .jpg filename.
 */
export const posterName = ( url ) => {
	const base = String( url ).split( '/' ).pop().split( '?' )[ 0 ].replace( /\.[^.]+$/, '' );

	return `${ base || 'video' }-poster.jpg`;
};
