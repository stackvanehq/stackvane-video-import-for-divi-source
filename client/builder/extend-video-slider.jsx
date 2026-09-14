/**
 * Extends Divi's built-in `divi/video-slider`: a Content-tab button opening a modal that bulk adds
 * `divi/video-slider-item` children from pasted URLs or a playlist. Registers no module of its own.
 */

// Divi's vendor React. Hooks called from a different React copy hit a null dispatcher.
const React = window?.vendor?.React || window?.React;
const { useState, useContext, useRef } = React || {};
const wpData = window?.vendor?.wp?.data || window?.wp?.data || {};
const { select, dispatch } = wpData;
const { addFilter } = window?.vendor?.wp?.hooks || window?.wp?.hooks || {};
const { registerFieldComponent } = window?.divi?.fieldLibrary || {};
const { ErrorBoundary } = window?.divi?.errorBoundary || {};
const moduleContext = window?.divi?.contextLibrary?.moduleContext;

// Read at render time, not parse time: divi-modal cannot be a dependency without pushing this
// bundle past divi-modal-library's one-shot modalMapping filter. See BuilderBundle::DEPS.
const diviModal = () => window?.divi?.modal || {};

import { __, _n, sprintf } from '@wordpress/i18n';

import { classifyUrl } from './classify';
import { captureFrame, findExistingPoster, posterName, uploadPoster } from './poster';

/** What each provider is called in the preview list. */
const PROVIDER_LABEL = {
	youtube: 'YouTube',
	vimeo: 'Vimeo',
	self: 'File',
};

/** The three places videos come from. Order is the order of the strip. */
const TABS = [
	{ id: 'media', label: () => __( 'Media Library', 'stackvane-video-import-for-divi' ) },
	{ id: 'external', label: () => __( 'External Videos', 'stackvane-video-import-for-divi' ) },
	{ id: 'history', label: () => __( 'History', 'stackvane-video-import-for-divi' ) },
];

const MODAL_NAME = 'svhq-svi/bulk-import';
const CHILD_NAME = 'divi/video-slider-item';

/** VB runtime data injected by PHP (BuilderBundle data_app_window). */
const vbData = () => window?.SvhqSviVbData || {};

const uuid = () =>
	'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace( /[xy]/g, ( c, i ) => {
		const r = ( ( Date.now ? Date.now() : 0 ) + i * 97 + performance.now() * 1000 ) % 16 | 0;

		return ( 'x' === c ? r : ( r & 0x3 ) | 0x8 ).toString( 16 );
	} );

/**
 * Splits the textarea into individual URLs: one per line, commas and stray whitespace tolerated,
 * blanks dropped.
 *
 * @param {string} raw The pasted text.
 * @return {string[]} Cleaned URLs, in the order pasted.
 */
const splitUrls = ( raw ) =>
	raw
		.split( /[\r\n,]+/ )
		.map( ( line ) => line.trim() )
		.filter( Boolean );

/*
 * The WordPress media frame, opened from the builder.
 *
 * `wp.media` lives on the TOP window, never the app frame this bundle runs in. Divi's own upload
 * field reaches it the same way (`topWindow.wp.media` throughout its field library), and Divi
 * already calls `wp_enqueue_media()` for the builder, so nothing extra has to be enqueued.
 * Reading `window.wp.media` instead would be undefined here and the button would do nothing.
 */
const topWp = () => window?.divi?.window?.topWindow?.wp || window?.parent?.wp || window?.wp;

let mediaFrame = null;

/**
 * Opens the media library filtered to video, with multi-select and the Upload Files tab that
 * WordPress provides itself.
 *
 * @param {Function} onSelect Called with the selected attachments as plain objects.
 */
const openMediaLibrary = ( onSelect ) => {
	const wp = topWp();

	if ( ! wp?.media ) {
		return false;
	}

	// One frame, reused. A new frame per click leaks a modal and its event handlers each time.
	if ( ! mediaFrame ) {
		mediaFrame = wp.media( {
			title: __( 'Choose Videos', 'stackvane-video-import-for-divi' ),
			library: { type: 'video' },
			button: { text: __( 'Add To Slider', 'stackvane-video-import-for-divi' ) },
			multiple: true,
		} );
	}

	// Rebound every open, so the handler always closes over the current state.
	mediaFrame.off( 'select' );
	mediaFrame.on( 'select', () => {
		onSelect( mediaFrame.state().get( 'selection' ).toJSON() );
	} );
	mediaFrame.open();

	return true;
};

/**
 * WordPress hands back its own generic icon when a video has no poster image. That is a picture of
 * a filmstrip, not of the video, so it is treated as no thumbnail at all.
 *
 * @param {Object} attachment One attachment from the media frame.
 * @return {string} A real thumbnail URL, or ''.
 */
const attachmentThumb = ( attachment ) => {
	const src = attachment?.image?.src || attachment?.thumb?.src || '';

	return src && ! src.includes( '/wp-includes/images/media/' ) ? src : '';
};

/**
 * Turns selected attachments into the same shape the import routes return, so the preview list,
 * the dedupe pass and the insert path treat them identically to a fetched video.
 *
 * @param {Array} attachments Attachments from the media frame.
 * @return {Array} Video entries.
 */
const attachmentsToVideos = ( attachments ) =>
	( attachments || [] )
		.filter( ( a ) => a?.url )
		.map( ( a ) => ( {
			provider: 'self',
			key: `self:${ String( a.url ).toLowerCase() }`,
			url: a.url,
			title: a.title || a.filename || __( 'Video', 'stackvane-video-import-for-divi' ),
			thumbnail: attachmentThumb( a ),
			duration: a.fileLength || '',
			views: '',
			ok: true,
		} ) );

/**
 * The video's filename, without its extension. Used as the title placeholder, because a full URL
 * is unreadable in a narrow row and tells the author nothing they can act on.
 *
 * @param {string} url The video URL.
 * @return {string} A short label.
 */
const fileLabel = ( url ) => {
	const base = String( url || '' ).split( '/' ).pop().split( '?' )[ 0 ];

	return base.replace( /\.[^.]+$/, '' ) || String( url || '' );
};

/** Only a local file with no poster is worth generating one for. */
const needsPoster = ( video ) => 'self' === video.provider && ! video.thumbnail;

/**
 * Generates and uploads a poster for each local video that lacks one.
 *
 * Sequential on purpose: each capture decodes a video, and running forty at once would stall the
 * browser. A failure is swallowed per video, because a missing poster is a cosmetic loss and must
 * not abort an import that is otherwise fine.
 *
 * @param {Array}    list       Videos about to be imported.
 * @param {Function} onProgress Called with (done, total).
 * @return {Promise<Object>} Poster URLs, keyed by video key.
 */
const generatePosters = ( list, onProgress ) => {
	const { mediaUrl, nonce } = vbData();
	const targets = list.filter( needsPoster );
	const posters = {};
	let index = 0;

	const next = () => {
		if ( index >= targets.length ) {
			return Promise.resolve( posters );
		}

		const video = targets[ index ];

		onProgress( index + 1, targets.length );

		const name = posterName( video.url );

		// An earlier import may already have made this exact poster.
		return findExistingPoster( name, mediaUrl, nonce )
			.then( ( found ) =>
				found || captureFrame( video.url ).then( ( blob ) => uploadPoster( blob, name, mediaUrl, nonce ) )
			)
			.then( ( src ) => {
				if ( src ) {
					posters[ video.key ] = src;
				}
			} )
			.catch( () => {
				/* No poster for this one. The slide still imports. */
			} )
			.then( () => {
				index += 1;

				return next();
			} );
	};

	return next();
};

/** Strip emoji and pictographic symbols from a title. */
const stripEmoji = ( s ) =>
	s.replace(
		/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}]/gu,
		''
	);

/** Remove special characters, keeping letters, numbers, spaces and basic punctuation. */
const stripSpecial = ( s ) => s.replace( /[^\p{L}\p{N}\s\-.,'&()]/gu, '' );

/** Capitalize the first letter of each word, leaving the rest of the word as typed. */
const toTitleCase = ( s ) => s.replace( /\S+/g, ( w ) => w.charAt( 0 ).toUpperCase() + w.slice( 1 ) );

/**
 * Apply the chosen title-cleaning options, then collapse runs of whitespace and trim.
 *
 * Applied in the builder rather than on the server so toggling an option re-labels the preview
 * list instantly, with no refetch and no second round trip.
 *
 * @param {string} title Raw title from the fetch.
 * @param {Object} opts  {emoji, special, titleCase}.
 * @return {string} Cleaned title.
 */
const cleanTitle = ( title, opts ) => {
	let t = String( title || '' );

	if ( opts.emoji ) {
		t = stripEmoji( t );
	}
	if ( opts.special ) {
		t = stripSpecial( t );
	}
	if ( opts.titleCase ) {
		t = toTitleCase( t );
	}

	return t.replace( /\s+/g, ' ' ).trim();
};

/**
 * One request to either import route. Both answer in the same `{videos: [...]}` shape, so the
 * preview list, the dedupe pass and the insert path downstream are shared by both tabs.
 *
 * The API key is never sent from here: the server reads it out of Divi's Theme Options itself, so
 * the site owner's Google credential never reaches a browser.
 *
 * @param {string} route 'bulk-import' | 'playlist-import'.
 * @param {Object} body  Route payload, plus the shared `mode`.
 * @return {Promise<Array>} The server's per-video results.
 */
const requestVideos = ( route, body ) => {
	const { restUrl, nonce } = vbData();

	return fetch( `${ restUrl }/${ route }`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce || '' },
		body: JSON.stringify( body ),
	} ).then( ( res ) =>
		res.json().then( ( payload ) => {
			if ( ! res.ok ) {
				throw new Error( payload?.message || __( 'Request Failed.', 'stackvane-video-import-for-divi' ) );
			}

			return payload.videos || [];
		} )
	);
};

/**
 * The history routes. Kept separate from requestVideos() because these answer with
 * `{history: [...]}` rather than `{videos: [...]}`.
 *
 * @param {string} path   Path after the namespace.
 * @param {string} method HTTP method.
 * @param {Object} body   Optional payload.
 * @return {Promise<Array>} The stored history, newest first.
 */
const requestHistory = ( path, method = 'GET', body = null ) => {
	const { restUrl, nonce } = vbData();

	return fetch( `${ restUrl }${ path }`, {
		method,
		headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce || '' },
		...( body ? { body: JSON.stringify( body ) } : {} ),
	} ).then( ( res ) =>
		res.json().then( ( payload ) => {
			if ( ! res.ok ) {
				throw new Error( payload?.message || __( 'Request Failed.', 'stackvane-video-import-for-divi' ) );
			}

			return payload.history || [];
		} )
	);
};

/**
 * The child module ids already in the slider, and the identity key (see classify.js) each one
 * resolves to. Used to skip a video the author already has, not just duplicates within this paste.
 *
 * @param {string} moduleId Parent module id.
 * @return {Set<string>} Existing identity keys.
 */
const getExistingKeys = ( moduleId ) => {
	const keys = new Set();

	try {
		const existing = select( 'divi/edit-post' ).getChildModules?.( moduleId );
		const children = existing ? ( Array.isArray( existing ) ? existing : Object.values( existing ) ) : [];

		children.forEach( ( child ) => {
			const attrs = child?.attrs || child?.props?.attrs || {};
			// Same path as buildChildAttrs writes: breakpoint first, subName inside the value.
			const url = attrs?.video?.innerContent?.desktop?.value?.src || '';
			const classified = url ? classifyUrl( url ) : null;

			if ( classified ) {
				keys.add( classified.key );
			}
		} );
	} catch {
		/* Editor not ready yet; treat as no existing children. */
	}

	return keys;
};

const getChildCount = ( moduleId ) => {
	try {
		const existing = select( 'divi/edit-post' ).getChildModules?.( moduleId );

		return existing ? ( Array.isArray( existing ) ? existing.length : Object.keys( existing ).length ) : 0;
	} catch {
		return 0;
	}
};

/**
 * Child attributes for one imported video.
 *
 * Breakpoint comes first and subName lives inside the value; any other shape makes
 * MultiViewUtils::normalize_value() throw on the front end. The title goes to Meta > Element
 * Label, the only place a Video Slider Item shows a name. The thumbnail is set here so the front
 * end skips its own oEmbed lookup on render.
 *
 * @param {Object} video One fetched/classified video, with its title already cleaned.
 * @return {Object} Child module attributes.
 */
const buildChildAttrs = ( video ) => {
	const attrs = {
		video: { innerContent: { desktop: { value: { src: video.url } } } },
	};

	if ( video.thumbnail ) {
		attrs.thumbnail = { innerContent: { desktop: { value: { src: video.thumbnail } } } };
	}

	if ( video.title ) {
		attrs.module = { meta: { adminLabel: { desktop: { value: video.title } } } };
	}

	return attrs;
};

const removeChildren = ( moduleId ) => {
	const d = dispatch( 'divi/edit-post' );
	const removeFn = d.removeModule || d.deleteModule || d.removeBlock;

	if ( ! removeFn ) {
		return 0;
	}
	let count = 0;

	try {
		const existing = select( 'divi/edit-post' ).getChildModules?.( moduleId );
		const children = existing ? ( Array.isArray( existing ) ? existing : Object.values( existing ) ) : [];

		children.forEach( ( child ) => {
			const id = child?.id || child?.clientId || child?.props?.id;

			if ( id ) {
				try {
					removeFn( id );
					count += 1;
				} catch {
					/* skip */
				}
			}
		} );
	} catch {
		/* nothing to remove */
	}

	return count;
};

/**
 * Inserts videos one at a time, 80ms apart, always as the LAST CHILD OF THE PARENT.
 *
 * Every insert targets the parent with position 'inside', never the previous slide with 'after'.
 * Divi's reducer resolves 'after' by reading `state[previousId].parent`, so a slide whose
 * predecessor has not been committed yet resolves its parent to `""`: the module is written into
 * state, parented to nothing, and never appears in the layout. On a long playlist that silently
 * loses most of the import while the preview still shows every video. 'inside' takes the parent
 * directly and appends (`[...children, id]`), so each insert stands alone.
 *
 * @param {Array}    videos     Videos to insert, in order.
 * @param {string}   moduleId   Parent module id.
 * @param {number}   startDelay Delay before the first insert (lets a Replace's removals settle).
 * @param {Function} onProgress Called with (insertedSoFar, total) after each insert.
 * @param {Function} onDone     Called with the number that actually inserted.
 */
const insertVideos = ( videos, moduleId, startDelay, onProgress, onDone ) => {
	const d = dispatch( 'divi/edit-post' );

	if ( 'function' !== typeof d.addModule || ! videos.length ) {
		onDone( 0 );

		return;
	}
	let inserted = 0;

	const insertNext = ( index ) => {
		if ( index >= videos.length ) {
			onDone( inserted );

			return;
		}

		try {
			// 6th argument is `caller`. Divi's own action creator defaults it to 'user' when omitted.
			d.addModule(
				moduleId,
				CHILD_NAME,
				{ attrs: buildChildAttrs( videos[ index ] ) },
				'inside',
				`svhq-svi-slide-${ uuid() }`,
				'default'
			);
			inserted += 1;
		} catch {
			// Counted as not inserted, so the summary reports what really landed.
		}

		onProgress( index + 1, videos.length );
		setTimeout( () => insertNext( index + 1 ), 80 );
	};

	setTimeout( () => insertNext( 0 ), startDelay );
};

/**
 * The covering overlay, used for both waits.
 *
 * The insert loop knows how far it has got, so it passes `total` and gets a progress bar. A fetch
 * has no measurable progress (one concurrent batch, no per-item callback), so it passes no total
 * and gets the spinner alone rather than a bar that would have to fake movement.
 *
 * @param {Object} props         Component props.
 * @param {string} props.label   What is happening.
 * @param {number} props.current Items done so far, when countable.
 * @param {number} props.total   Items in total, when countable.
 * @return {React.ReactElement} The overlay.
 */
const BusyOverlay = ( { label, current = 0, total = 0 } ) => {
	const pct = total ? Math.round( ( current / total ) * 100 ) : 0;

	return (
		<div className="overlay" role="status" aria-live="polite">
			<div className="spinner" aria-hidden="true" />
			<p className="overlay-text">{ label }</p>
			{ total > 0 ? (
				<div className="track">
					<div className="fill" style={ { width: `${ pct }%` } } />
				</div>
			) : null }
		</div>
	);
};

/** The bulk-import modal. */
const ImportModal = ( { name, moduleId } ) => {
	// Which group the videos come from, and which input inside External Videos.
	const [ tab, setTab ] = useState( 'media' );
	const [ source, setSource ] = useState( 'urls' );
	const [ raw, setRaw ] = useState( '' );
	const [ playlist, setPlaylist ] = useState( '' );
	const [ mode, setMode ] = useState( 'free' );
	// On by default: a slider of slides all named "Video Slider Item" is the thing this whole
	// import is meant to avoid.
	const [ addTitle, setAddTitle ] = useState( true );
	// Emoji stripping defaults on: a YouTube title full of pictographs makes an unreadable label in
	// the layers panel, which is the one place these titles are actually read.
	const [ opts, setOpts ] = useState( { emoji: true, special: false, titleCase: false } );
	// Off by default: every generated poster becomes a new Media Library attachment.
	const [ makePosters, setMakePosters ] = useState( false );
	// Titles the author typed, keyed by video. Kept apart from the fetched title so clearing one
	// restores what was fetched rather than leaving the slide unnamed.
	const [ titles, setTitles ] = useState( {} );
	// Reordering runs on pointer events, not HTML5 drag-and-drop.
	//
	// Two reasons, both real. A `draggable` row swallows text selection in the title field inside
	// it, so renaming stops working. And HTML5 drag needs `dataTransfer.setData()` to start at all,
	// which is easy to miss and fails differently per browser. Divi drags its own modal with mouse
	// events too, so this matches what the surrounding UI already does.
	const [ dragIndex, setDragIndex ] = useState( null );
	const [ overIndex, setOverIndex ] = useState( null );
	const dragRef = useRef( { from: null, to: null } );
	const [ videos, setVideos ] = useState( [] );
	const [ history, setHistory ] = useState( [] );
	const [ historyLoaded, setHistoryLoaded ] = useState( false );
	const [ insertMode, setInsertMode ] = useState( 'append' );
	const [ loading, setLoading ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ progress, setProgress ] = useState( null );
	const [ done, setDone ] = useState( null );

	const hasApiKey = !! vbData().hasApiKey;
	const canUpload = false !== vbData().canUpload;
	const historyEnabled = false !== vbData().historyEnabled;
	const existing = getChildCount( moduleId );
	const isMedia = 'media' === tab;
	const isExternal = 'external' === tab;
	const isHistory = 'history' === tab;
	const isPlaylist = isExternal && 'playlist' === source;

	const close = () => dispatch( 'divi/modal-library' ).close( { name: MODAL_NAME } );

	// Switching tabs clears the pending result so one tab's list cannot be imported from the other.
	const switchTab = ( next ) => {
		if ( next === tab ) {
			return;
		}
		setTab( next );
		setVideos( [] );
		setError( '' );
		setDone( null );

		if ( 'history' === next && ! historyLoaded ) {
			loadHistory();
		}
	};

	const fetchNow = () => {
		const urls = isPlaylist ? [] : splitUrls( raw );

		if ( isPlaylist && ! playlist.trim() ) {
			setError( __( 'Paste A YouTube Playlist URL.', 'stackvane-video-import-for-divi' ) );

			return;
		}
		if ( ! isPlaylist && ! urls.length ) {
			setError( __( 'Paste At Least One Video URL.', 'stackvane-video-import-for-divi' ) );

			return;
		}
		setError( '' );
		setDone( null );
		setLoading( true );

		const request = isPlaylist
			? requestVideos( 'playlist-import', { playlist: playlist.trim(), mode } )
			: requestVideos( 'bulk-import', { urls, mode } );

		request
			.then( ( results ) => {
				// A second dedupe pass the server cannot do: against videos already sitting in
				// this slider. Anything the server already flagged (invalid, duplicate-in-list)
				// is left as is.
				const existingKeys = 'replace' === insertMode ? new Set() : getExistingKeys( moduleId );
				const seen = new Set();
				const withSliderCheck = results.map( ( video ) => {
					if ( ! video.ok ) {
						return video;
					}
					if ( existingKeys.has( video.key ) ) {
						return { ...video, ok: false, error: __( 'Already In This Slider.', 'stackvane-video-import-for-divi' ) };
					}
					if ( seen.has( video.key ) ) {
						return {
							...video,
							ok: false,
							error: isPlaylist
								? __( 'Listed Twice In This Playlist.', 'stackvane-video-import-for-divi' )
								: __( 'Duplicate In The Pasted List.', 'stackvane-video-import-for-divi' ),
						};
					}
					seen.add( video.key );

					return video;
				} );

				setVideos( withSliderCheck );
				setLoading( false );

				if ( ! withSliderCheck.some( ( v ) => v.ok ) ) {
					setError( __( 'None Of These Could Be Added. See The Reasons Below.', 'stackvane-video-import-for-divi' ) );
				}
			} )
			.catch( ( e ) => {
				setLoading( false );
				setVideos( [] );
				setError( e.message || __( 'Could Not Fetch These Videos.', 'stackvane-video-import-for-divi' ) );
			} );
	};

	const loadHistory = () => {
		requestHistory( '/history' )
			.then( ( list ) => {
				setHistory( list );
				setHistoryLoaded( true );
			} )
			.catch( () => setHistoryLoaded( true ) );
	};

	/**
	 * What a history entry is called. A playlist keeps its URL; anything else is described by where
	 * it came from and how many it carried.
	 *
	 * @param {number} count How many videos were attempted.
	 * @return {string} The entry label.
	 */
	const historyLabel = ( count ) => {
		if ( isPlaylist ) {
			return playlist.trim();
		}

		return isMedia
			/* translators: %d: number of videos chosen from the media library. */
			? sprintf( __( '%d From Media Library', 'stackvane-video-import-for-divi' ), count )
			/* translators: %d: number of videos in the pasted list. */
			: sprintf( __( '%d Pasted URLs', 'stackvane-video-import-for-divi' ), count );
	};

	/** Stores what was just imported, so it can be put into another slider later. */
	const recordHistory = ( inserted, attempted ) => {
		if ( inserted < 1 || ! historyEnabled ) {
			return;
		}

		requestHistory( '/history', 'POST', {
			source: isPlaylist ? 'playlist' : 'urls',
			label: historyLabel( attempted.length ),
			videos: attempted.map( ( v ) => ( {
				url: v.url,
				key: v.key,
				provider: v.provider,
				title: v.title,
				thumbnail: v.thumbnail,
				duration: v.duration,
				views: v.views,
			} ) ),
		} )
			.then( setHistory )
			.catch( () => {} );
	};

	const deleteHistory = ( id ) => {
		setHistory( ( list ) => list.filter( ( entry ) => entry.id !== id ) );
		requestHistory( `/history/${ id }`, 'DELETE' ).then( setHistory ).catch( loadHistory );
	};

	/**
	 * Puts a ready-made list into the preview, deduped against this slider and against itself.
	 *
	 * Used by the media picker and by a History reimport. Neither fetches anything, so this is the
	 * whole of their work.
	 *
	 * @param {Array}  list      Video entries.
	 * @param {string} duplicate What to say about a repeat within the list itself.
	 */
	const stageVideos = ( list, duplicate ) => {
		const existingKeys = getExistingKeys( moduleId );
		const seen = new Set();

		setVideos(
			( list || [] ).map( ( video ) => {
				if ( existingKeys.has( video.key ) ) {
					return { ...video, ok: false, error: __( 'Already In This Slider.', 'stackvane-video-import-for-divi' ) };
				}
				if ( seen.has( video.key ) ) {
					return { ...video, ok: false, error: duplicate };
				}
				seen.add( video.key );

				return { ...video, ok: true };
			} )
		);
		setError( '' );
		setDone( null );
	};

	const reimport = ( entry ) =>
		stageVideos( entry.videos, __( 'Listed Twice In This Playlist.', 'stackvane-video-import-for-divi' ) );

	const chooseFromMediaLibrary = () => {
		const opened = openMediaLibrary( ( attachments ) => {
			stageVideos(
				attachmentsToVideos( attachments ),
				__( 'Selected Twice.', 'stackvane-video-import-for-divi' )
			);
		} );

		if ( ! opened ) {
			setError( __( 'The Media Library Could Not Be Opened. Please Reload The Builder.', 'stackvane-video-import-for-divi' ) );
		}
	};

	// Derived, not written back to state, so unticking an option restores the original title.
	const cleaned = videos.map( ( v ) => {
		const typed = ( titles[ v.key ] || '' ).trim();

		return {
			...v,
			// An empty title makes buildChildAttrs skip the adminLabel entirely, which is exactly
			// what the toggle being off should mean: Divi keeps its own default label.
			title: addTitle ? ( typed || cleanTitle( v.title, opts ) ) : '',
		};
	} );
	const toImport = cleaned.filter( ( v ) => v.ok );
	const posterCount = toImport.filter( needsPoster ).length;

	/**
	 * Moves one row, which is also the order the slides are created in.
	 *
	 * @param {number} from Current index.
	 * @param {number} to   Target index.
	 */
	const moveVideo = ( from, to ) => {
		if ( from === to || to < 0 || to >= videos.length ) {
			return;
		}

		setVideos( ( list ) => {
			const next = [ ...list ];
			const [ moved ] = next.splice( from, 1 );

			next.splice( to, 0, moved );

			return next;
		} );
	};

	const setTitle = ( key, value ) => setTitles( ( all ) => ( { ...all, [ key ]: value } ) );

	/** Drops one row from the list about to be imported. */
	const removeVideo = ( index ) =>
		setVideos( ( list ) => list.filter( ( item, i ) => i !== index ) );

	/**
	 * Starts a pointer drag from a row's handle.
	 *
	 * The document is taken from the event rather than the global, because Divi renders modals into
	 * the TOP window while this bundle runs in the app frame. Binding to the wrong `document` means
	 * the move and release are never heard and the row sticks to the cursor.
	 *
	 * @param {number} index Row being dragged.
	 * @param {Object} event The pointer event.
	 */
	const startDrag = ( index, event ) => {
		event.preventDefault();

		const doc = event.currentTarget.ownerDocument;

		dragRef.current = { from: index, to: index };
		setDragIndex( index );
		setOverIndex( index );

		const onMove = ( e ) => {
			const under = doc.elementFromPoint( e.clientX, e.clientY );
			const row = under && under.closest ? under.closest( '[data-row-index]' ) : null;

			if ( ! row ) {
				return;
			}

			const to = Number( row.getAttribute( 'data-row-index' ) );

			dragRef.current.to = to;
			setOverIndex( to );
		};

		const onUp = () => {
			doc.removeEventListener( 'mousemove', onMove );
			doc.removeEventListener( 'mouseup', onUp );

			const { from, to } = dragRef.current;

			if ( null !== from && null !== to ) {
				moveVideo( from, to );
			}

			dragRef.current = { from: null, to: null };
			setDragIndex( null );
			setOverIndex( null );
		};

		doc.addEventListener( 'mousemove', onMove );
		doc.addEventListener( 'mouseup', onUp );
	};

	const importNow = () => {
		if ( ! moduleId || ! toImport.length ) {
			return;
		}
		setLoading( true );

		const insertAll = ( list ) => {
			setProgress( { current: 0, total: list.length, posters: false } );

			const removed = 'replace' === insertMode ? removeChildren( moduleId ) : 0;

			runInsert( list, removed );
		};

		// Posters are generated before anything is inserted, so a slide is never created and then
		// edited: it arrives complete.
		if ( makePosters && posterCount > 0 ) {
			setProgress( { current: 0, total: posterCount, posters: true } );

			generatePosters( toImport, ( current, total ) =>
				setProgress( { current, total, posters: true } )
			).then( ( posters ) =>
				insertAll(
					toImport.map( ( v ) => ( posters[ v.key ] ? { ...v, thumbnail: posters[ v.key ] } : v ) )
				)
			);

			return;
		}

		insertAll( toImport );
	};

	const runInsert = ( list, removed ) => {
		insertVideos(
			list,
			moduleId,
			removed > 0 ? 200 : 0,
			( current, total ) => setProgress( { current, total, posters: false } ),
			( inserted ) => {
				setLoading( false );
				setProgress( null );
				setDone( inserted );
				setVideos( [] );
				// Overrides belong to the batch that is now gone.
				setTitles( {} );

				// A partial import is stated, never rounded up to the number that was asked for.
				if ( inserted < list.length ) {
					setError(
						sprintf(
							/* translators: 1: number inserted, 2: number attempted. */
							__( 'Only %1$d Of %2$d Videos Could Be Added. Try The Rest Again.', 'stackvane-video-import-for-divi' ),
							inserted,
							list.length
						)
					);
				}

				recordHistory( inserted, list );

				if ( isPlaylist ) {
					setPlaylist( '' );
				} else {
					setRaw( '' );
				}
			}
		);
	};

	const { WrapperContainer, Header, BodyContainer, PanelContainer, Footer } = diviModal();

	return (
		<ErrorBoundary key={ MODAL_NAME } componentName={ MODAL_NAME }>
			<WrapperContainer draggable resizable expandable={ false } snappable modalName={ name } centered>
				<Header name={ __( 'Bulk Import Videos', 'stackvane-video-import-for-divi' ) } />
				<BodyContainer>
					<PanelContainer id="svhq-svi-import" opened>
						<div className="svhq-svi">
							{ progress ? (
								<BusyOverlay
									label={ progress.posters
										/* translators: 1: current poster number, 2: total posters. */
										? sprintf( __( 'Generating Poster %1$d Of %2$d.', 'stackvane-video-import-for-divi' ), progress.current, progress.total )
										/* translators: 1: current video number, 2: total number of videos. */
										: sprintf( __( 'Adding Video %1$d Of %2$d.', 'stackvane-video-import-for-divi' ), progress.current, progress.total ) }
									current={ progress.current }
									total={ progress.total }
								/>
							) : null }

							{ loading && ! progress ? (
								<BusyOverlay
									label={ isPlaylist
										? __( 'Reading The Playlist…', 'stackvane-video-import-for-divi' )
										: __( 'Fetching Videos…', 'stackvane-video-import-for-divi' ) }
								/>
							) : null }

							{ /* Grouped by where the videos come from, which is the only choice that changes the form. */ }
							<div className="tabs" role="tablist">
								{ TABS.map( ( item ) => (
									<button
										key={ item.id }
										type="button"
										role="tab"
										aria-selected={ tab === item.id }
										className="tab"
										onClick={ () => switchTab( item.id ) }
									>
										{ item.label() }
									</button>
								) ) }
							</div>

							{ error ? <p className="alert">{ error }</p> : null }
							{ null !== done ? (
								<p className="done">
									{ /* translators: %d: number of videos added. */ }
									{ sprintf( _n( '%d Video Added.', '%d Videos Added.', done, 'stackvane-video-import-for-divi' ), done ) }
								</p>
							) : null }

							{ /* ── Source ─────────────────────────────────────────────── */ }
							{ isHistory ? null : (
								<section className="section">
									<h3 className="section-title">{ __( 'Source', 'stackvane-video-import-for-divi' ) }</h3>

									{ isMedia ? (
										<div className="media-pick">
											<button type="button" className="btn btn-primary" onClick={ chooseFromMediaLibrary }>
												{ __( 'Choose Videos', 'stackvane-video-import-for-divi' ) }
											</button>
											<p className="hint">
												{ __( 'Pick As Many As You Like, Or Upload New Ones From The Same Window. Nothing Is Fetched And No API Key Is Needed.', 'stackvane-video-import-for-divi' ) }
											</p>
										</div>
									) : (
										<>
											<div className="segmented" role="tablist">
												<button
													type="button"
													role="tab"
													aria-selected={ ! isPlaylist }
													className="segment"
													onClick={ () => setSource( 'urls' ) }
												>
													{ __( 'URL List', 'stackvane-video-import-for-divi' ) }
												</button>
												<button
													type="button"
													role="tab"
													aria-selected={ isPlaylist }
													className="segment"
													onClick={ () => setSource( 'playlist' ) }
												>
													{ __( 'YouTube Playlist', 'stackvane-video-import-for-divi' ) }
												</button>
											</div>

											{ isPlaylist ? (
												<>
													<input
														id="svhq-svi-playlist"
														type="text"
														className="input"
														value={ playlist }
														placeholder="https://www.youtube.com/playlist?list=PL…"
														onChange={ ( e ) => setPlaylist( e.target.value ) }
													/>
													<p className="hint">
														{ __( 'The Playlist Must Be Public.', 'stackvane-video-import-for-divi' ) }
													</p>
												</>
											) : (
												<>
													<textarea
														id="svhq-svi-urls"
														className="textarea"
														value={ raw }
														placeholder={ 'https://www.youtube.com/watch?v=…\nhttps://vimeo.com/…\nhttps://example.com/my-video.mp4' }
														onChange={ ( e ) => setRaw( e.target.value ) }
													/>
													<p className="hint">
														{ __( 'One URL Per Line. YouTube, Vimeo And Direct MP4 Or WEBM Files.', 'stackvane-video-import-for-divi' ) }
													</p>
												</>
											) }
										</>
									) }
								</section>
							) }

							{ /* ── Detail level, external only ────────────────────────── */ }
							{ isExternal ? (
								<section className="section">
									<h3 className="section-title">{ __( 'Detail Level', 'stackvane-video-import-for-divi' ) }</h3>

									<div className="modes">
										<label className={ `mode${ 'free' === mode ? ' is-active' : '' }` }>
											<input type="radio" checked={ 'free' === mode } onChange={ () => setMode( 'free' ) } />
											<span className="mode-body">
												<span className="mode-name">{ __( 'Free', 'stackvane-video-import-for-divi' ) }</span>
												<span className="mode-hint">
													{ isPlaylist
														? __( 'About 15 Most Recent Videos. No API Key.', 'stackvane-video-import-for-divi' )
														: __( 'Title And Thumbnail. No API Key.', 'stackvane-video-import-for-divi' ) }
												</span>
											</span>
										</label>
										<label className={ `mode${ 'api' === mode ? ' is-active' : '' }` }>
											<input type="radio" checked={ 'api' === mode } onChange={ () => setMode( 'api' ) } />
											<span className="mode-body">
												<span className="mode-name">{ __( 'API', 'stackvane-video-import-for-divi' ) }</span>
												<span className="mode-hint">
													{ isPlaylist
														? __( 'Full Playlist, With Durations And Views.', 'stackvane-video-import-for-divi' )
														: __( 'Adds Real Durations And View Counts.', 'stackvane-video-import-for-divi' ) }
												</span>
											</span>
										</label>
									</div>

									{ 'api' === mode && ! hasApiKey ? (
										<p className="note">
											{ __( 'No API Key Is Saved Yet, So This Will Use The Free Method. Add One Under', 'stackvane-video-import-for-divi' ) }
											{ ' ' }<strong>{ __( 'Divi, Theme Options, StackVane Video Import for Divi', 'stackvane-video-import-for-divi' ) }</strong>{ '.' }
										</p>
									) : null }
								</section>
							) : null }

							{ /* ── Titles, every source ───────────────────────────────── */ }
							{ isHistory ? null : (
								<section className="section">
									<h3 className="section-title">{ __( 'Titles', 'stackvane-video-import-for-divi' ) }</h3>

									<label className="switch">
										<input
											type="checkbox"
											checked={ addTitle }
											onChange={ () => setAddTitle( ( v ) => ! v ) }
										/>
										<span className="switch-track" aria-hidden="true"><span className="switch-knob" /></span>
										<span className="switch-body">
											<span className="switch-name">{ __( 'Name Each Slide', 'stackvane-video-import-for-divi' ) }</span>
											<span className="switch-hint">
												{ __( 'Uses The Video Title As The Element Label, So The Layers Panel Is Readable.', 'stackvane-video-import-for-divi' ) }
											</span>
										</span>
									</label>

									{ addTitle ? (
										<div className="chips">
											<label className={ `chip${ opts.emoji ? ' is-on' : '' }` }>
												<input
													type="checkbox"
													checked={ opts.emoji }
													onChange={ () => setOpts( ( o ) => ( { ...o, emoji: ! o.emoji } ) ) }
												/>
												{ __( 'Remove Emojis', 'stackvane-video-import-for-divi' ) }
											</label>
											<label className={ `chip${ opts.special ? ' is-on' : '' }` }>
												<input
													type="checkbox"
													checked={ opts.special }
													onChange={ () => setOpts( ( o ) => ( { ...o, special: ! o.special } ) ) }
												/>
												{ __( 'Remove Special Characters', 'stackvane-video-import-for-divi' ) }
											</label>
											<label className={ `chip${ opts.titleCase ? ' is-on' : '' }` }>
												<input
													type="checkbox"
													checked={ opts.titleCase }
													onChange={ () => setOpts( ( o ) => ( { ...o, titleCase: ! o.titleCase } ) ) }
												/>
												{ __( 'Title Case', 'stackvane-video-import-for-divi' ) }
											</label>
										</div>
									) : null }
								</section>
							) }

							{ /* Only local files can take a generated poster, so this appears only when some are staged. */ }
							{ posterCount > 0 && canUpload ? (
								<section className="section">
									<h3 className="section-title">{ __( 'Posters', 'stackvane-video-import-for-divi' ) }</h3>

									<label className="switch">
										<input
											type="checkbox"
											checked={ makePosters }
											onChange={ () => setMakePosters( ( v ) => ! v ) }
										/>
										<span className="switch-track" aria-hidden="true"><span className="switch-knob" /></span>
										<span className="switch-body">
											<span className="switch-name">
												{ sprintf(
													/* translators: %d: how many videos have no poster image. */
													_n(
														'Generate A Poster For %d Video',
														'Generate A Poster For %d Videos',
														posterCount,
														'stackvane-video-import-for-divi'
													),
													posterCount
												) }
											</span>
											<span className="switch-hint">
												{ __( 'Grabs A Frame From Each File And Saves It To Your Media Library As The Overlay Image. Only Works For Files On This Site.', 'stackvane-video-import-for-divi' ) }
											</span>
										</span>
									</label>
								</section>
							) : null }

							{ /* Fetching is the external tab's own step; media stages instantly. */ }
							{ isExternal ? (
								<div className="actions">
									<button
										type="button"
										className="btn"
										disabled={ loading || ! ( isPlaylist ? playlist.trim() : raw.trim() ) }
										onClick={ fetchNow }
									>
										{ loading && ! videos.length
											? __( 'Fetching…', 'stackvane-video-import-for-divi' )
											: __( 'Fetch Videos', 'stackvane-video-import-for-divi' ) }
									</button>
								</div>
							) : null }

							{ /* ── History ────────────────────────────────────────────── */ }
							{ isHistory ? (
								<section className="section">
									<h3 className="section-title">{ __( 'Past Imports', 'stackvane-video-import-for-divi' ) }</h3>

									{ ! historyEnabled ? (
										<p className="note">
											{ __( 'Saving Is Turned Off Under Divi, Theme Options. Imports Are No Longer Recorded, And Anything Below Was Saved Before That.', 'stackvane-video-import-for-divi' ) }
										</p>
									) : null }

									{ ! historyLoaded ? (
										<p className="hint">{ __( 'Loading…', 'stackvane-video-import-for-divi' ) }</p>
									) : null }

									{ historyLoaded && ! history.length ? (
										<p className="hint">
											{ __( 'Nothing Imported Yet. Your Imports Are Saved Here So You Can Add Them To Another Slider Later.', 'stackvane-video-import-for-divi' ) }
										</p>
									) : null }

									<div className="history">
										{ history.map( ( entry ) => (
											<div key={ entry.id } className="history-row">
												<span className={ `history-kind is-${ entry.source }` }>
													{ 'playlist' === entry.source
														? __( 'Playlist', 'stackvane-video-import-for-divi' )
														: __( 'Videos', 'stackvane-video-import-for-divi' ) }
												</span>
												<span className="history-body">
													<span className="history-title">{ entry.label || __( 'Untitled Import', 'stackvane-video-import-for-divi' ) }</span>
													<span className="history-meta">
														{ sprintf(
															/* translators: %d: number of videos stored in this entry. */
															_n( '%d Video', '%d Videos', entry.count, 'stackvane-video-import-for-divi' ),
															entry.count
														) }
													</span>
												</span>
												<button
													type="button"
													className="btn btn-small"
													onClick={ () => reimport( entry ) }
												>
													{ __( 'Reimport', 'stackvane-video-import-for-divi' ) }
												</button>
												<button
													type="button"
													className="btn btn-small btn-danger"
													onClick={ () => deleteHistory( entry.id ) }
												>
													{ __( 'Delete', 'stackvane-video-import-for-divi' ) }
												</button>
											</div>
										) ) }
									</div>
								</section>
							) : null }

							{ /* ── Ready to import ────────────────────────────────────── */ }
							{ videos.length > 0 ? (
								<section className="section result">
									<div className="summary">
										<h3 className="section-title">
											{ /* translators: %d: number of videos ready to import. */ }
											{ sprintf( __( '%d Ready To Import', 'stackvane-video-import-for-divi' ), toImport.length ) }
										</h3>
										{ videos.length > toImport.length ? (
											<span className="count-skipped">
												{ /* translators: %d: number of videos skipped. */ }
												{ sprintf( __( '%d Skipped', 'stackvane-video-import-for-divi' ), videos.length - toImport.length ) }
											</span>
										) : null }

										<div className="placement">
											<label className={ `placement-option${ 'append' === insertMode ? ' is-active' : '' }` }>
												<input type="radio" checked={ 'append' === insertMode } onChange={ () => setInsertMode( 'append' ) } />
												{ existing
													/* translators: %d: number of videos already in the slider. */
													? sprintf( __( 'Append (%d)', 'stackvane-video-import-for-divi' ), existing )
													: __( 'Append', 'stackvane-video-import-for-divi' ) }
											</label>
											<label className={ `placement-option is-replace${ 'replace' === insertMode ? ' is-active' : '' }` }>
												<input type="radio" checked={ 'replace' === insertMode } onChange={ () => setInsertMode( 'replace' ) } />
												{ __( 'Replace All', 'stackvane-video-import-for-divi' ) }
											</label>
										</div>
									</div>

									<p className="hint">
										{ __( 'Drag To Reorder. Click A Title To Change It.', 'stackvane-video-import-for-divi' ) }
									</p>

									<div className={ `list${ null !== dragIndex ? ' is-sorting' : '' }` }>
										{ cleaned.map( ( v, i ) => (
											<div
												key={ `${ v.url }-${ i }` }
												data-row-index={ i }
												className={ `row${ v.ok ? '' : ' is-skipped' }${ dragIndex === i ? ' is-dragging' : '' }${ null !== dragIndex && overIndex === i && dragIndex !== i ? ' is-over' : '' }` }
											>
												{ /* Only the handle drags, so the title field keeps its own text selection. */ }
												<span
													className="grip"
													role="button"
													tabIndex={ 0 }
													aria-label={ __( 'Reorder This Video', 'stackvane-video-import-for-divi' ) }
													onMouseDown={ ( e ) => startDrag( i, e ) }
													onKeyDown={ ( e ) => {
														if ( 'ArrowUp' === e.key ) {
															e.preventDefault();
															moveVideo( i, i - 1 );
														}
														if ( 'ArrowDown' === e.key ) {
															e.preventDefault();
															moveVideo( i, i + 1 );
														}
													} }
												>
													<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
														<circle cx="6" cy="3" r="1.4" /><circle cx="10" cy="3" r="1.4" />
														<circle cx="6" cy="8" r="1.4" /><circle cx="10" cy="8" r="1.4" />
														<circle cx="6" cy="13" r="1.4" /><circle cx="10" cy="13" r="1.4" />
													</svg>
												</span>

												{ v.thumbnail
													? <img src={ v.thumbnail } alt="" className="thumb" />
													: <span className="thumb" /> }

												<span className="row-body">
													{ addTitle ? (
														<input
															type="text"
															className="row-title-input"
															value={ v.title }
															placeholder={ fileLabel( v.url ) }
															aria-label={ __( 'Slide Title', 'stackvane-video-import-for-divi' ) }
															onChange={ ( e ) => setTitle( v.key, e.target.value ) }
														/>
													) : (
														<span className="row-title">{ fileLabel( v.url ) }</span>
													) }
													{ v.provider || v.duration || v.views ? (
														<span className="row-meta">
															{ v.provider ? <span>{ PROVIDER_LABEL[ v.provider ] || v.provider }</span> : null }
															{ v.duration ? <span>{ v.duration }</span> : null }
															{ v.views ? <span>{ v.views }</span> : null }
														</span>
													) : null }
												</span>

												{ ! v.ok ? <span className="reason">{ v.error }</span> : null }

												<button
													type="button"
													className="row-remove"
													aria-label={ __( 'Remove This Video', 'stackvane-video-import-for-divi' ) }
													title={ __( 'Remove', 'stackvane-video-import-for-divi' ) }
													onClick={ () => removeVideo( i ) }
												>
													<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
														<path d="M4 4l8 8M12 4l-8 8" />
													</svg>
												</button>
											</div>
										) ) }
									</div>
								</section>
							) : null }
						</div>
					</PanelContainer>
				</BodyContainer>
				<Footer
					buttons={ [
						{
							name: 'cancel',
							label: __( 'Close', 'stackvane-video-import-for-divi' ),
							buttonColor: 'secondary',
							showIcon: false,
							showLabel: true,
							onClick: close,
						},
						{
							name: 'import',
							label: loading && progress
								? __( 'Importing…', 'stackvane-video-import-for-divi' )
								/* translators: %d: number of videos about to be imported. */
								: sprintf( _n( 'Import %d Video', 'Import %d Videos', toImport.length, 'stackvane-video-import-for-divi' ), toImport.length ),
							buttonColor: 'replace' === insertMode ? 'warning' : 'primary',
							disabled: ! toImport.length || loading,
							showIcon: false,
							showLabel: true,
							onClick: importNow,
						},
					] }
				/>
			</WrapperContainer>
		</ErrorBoundary>
	);
};

let modalModuleId = '';

if ( addFilter ) {
	addFilter( 'divi.modalLibrary.modalMapping', 'svhq-svi/bulk-import', ( modals ) => {
		modals.SvhqSviBulkImport = {
			name: MODAL_NAME,
			label: __( 'Bulk Import Videos', 'stackvane-video-import-for-divi' ),
			type: 'multiInstanceModal',
			component: ( props ) => <ImportModal { ...props } moduleId={ modalModuleId } />,
		};

		return modals;
	} );
}

/** The open `divi/video-slider` instance. Divi's context value is `{moduleId, moduleName}`. */
const useModuleId = () => {
	let ctx = null;

	try {
		// Module-scope constant, so hook order is stable; the rule cannot see that.
		// eslint-disable-next-line react-hooks/rules-of-hooks
		ctx = moduleContext ? useContext( moduleContext ) : null;
	} catch {
		ctx = null;
	}

	return ctx?.moduleId || ctx?.id || '';
};

const ImportButton = ( props ) => {
	const ctxId = useModuleId();
	const moduleId = props?.moduleId || ctxId;

	const open = () => {
		modalModuleId = moduleId;
		dispatch( 'divi/modal-library' ).setDimension( { name: MODAL_NAME, dimension: { width: 560, height: 620 } } );
		dispatch( 'divi/modal-library' ).open( { name: MODAL_NAME } );
	};

	return (
		<button type="button" className="svhq-svi-open-btn" onClick={ open }>
			<span className="svhq-svi-open-btn__icon" aria-hidden="true">
				<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
					<path d="M7.25 1.5h1.5v6.19l2.22-2.22 1.06 1.06L8 11.56 3.97 6.53l1.06-1.06 2.22 2.22V1.5Z" />
					<path d="M2 10.5h1.5v3h9v-3H14v3A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-3Z" />
				</svg>
			</span>
			<span className="svhq-svi-open-btn__label">
				{ __( 'Bulk Import Videos', 'stackvane-video-import-for-divi' ) }
			</span>
		</button>
	);
};

if ( registerFieldComponent ) {
	registerFieldComponent( { name: 'svhq-svi/bulk-import-button', component: ImportButton } );
}

/**
 * Both filters fire once at builder boot, before any panel opens, which is why BuilderBundle loads
 * in the head. Registered after module-library, they would silently never apply.
 */
/**
 * The button is added to Divi's own Elements group rather than a group of this plugin's own.
 *
 * `contentElements` already holds the module's Elements list (priority 5), Show Arrows (20) and
 * Slider Controls (30), all read from Divi's video-slider module.json. Priority 40 puts the button
 * after them, at the end of the group, which is where an action belongs.
 *
 * This filter fires once at builder boot, before any panel opens, which is why BuilderBundle loads
 * in the head. Registered after module-library, it would silently never apply.
 */
if ( addFilter ) {
	addFilter(
		'divi.moduleLibrary.moduleAttributes.divi.video-slider',
		'svhq-svi/bulk-import-attr',
		( attributes ) => {
			attributes.svhqSviBulkImport = {
				type: 'object',
				settings: {
					innerContent: {
						groupType: 'group-items',
						items: {
							button: {
								groupSlug: 'contentElements',
								attrName: 'svhqSviBulkImport.innerContent',
								subName: 'button',
								label: '',
								priority: 40,
								render: true,
								features: { sticky: false },
								component: { type: 'field', name: 'svhq-svi/bulk-import-button' },
							},
						},
					},
				},
			};

			return attributes;
		}
	);
}
