/*
 * Builds the JSON catalogues `wp_set_script_translations()` reads, from whatever .po files
 * languages/ holds.
 *
 * Every rule below was read out of WordPress core, not remembered.
 *
 * `_load_script_textdomain_from_src()` in wp-includes/l10n.php looks for TWO filenames, in order:
 *
 *   1. `{domain}-{locale}-{handle}.json`, when a path was passed to
 *      `wp_set_script_translations()` (this plugin's one call passes one).
 *   2. `{domain}-{locale}-{md5(relative)}.json`, where `relative` is the script src relative to the
 *      plugin folder, with `.min.js` rewritten back to `.js` before hashing.
 *
 * Both names are written here, because the first depends on the handle still being registered
 * under the name this plugin passed and the second does not.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const slug = 'stackvane-video-import-for-divi';
const dir = path.join(root, 'languages');

const HANDLE = 'svhq-svi-vb';
const SOURCE = 'dist/builder.js';
const OWNS = (ref) => ref.startsWith('client/builder/');

// gettext's own context separator, written as an escape rather than as the literal byte: that byte
// is invisible in an editor and one careless edit from disappearing without a syntax error.
const CONTEXT_GLUE = '';

const unescape = (value) => value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');

const parsePo = (text) => {
    const entries = [];
    let entry = null;
    let field = '';

    const push = () => {
        if (entry) {
            entries.push(entry);
        }
    };

    text.split(/\r?\n/).forEach((line) => {
        if (line.startsWith('#:')) {
            if (!entry) {
                entry = { references: [], msgctxt: null, msgid: '', msgid_plural: null, msgstr: [] };
            }

            line.slice(2).trim().split(/\s+/).filter(Boolean).forEach((ref) => {
                entry.references.push(ref.replace(/:\d+$/, ''));
            });

            return;
        }

        if (line.startsWith('#')) {
            return;
        }

        if (line.trim() === '') {
            push();
            entry = null;
            field = '';

            return;
        }

        if (!entry) {
            entry = { references: [], msgctxt: null, msgid: '', msgid_plural: null, msgstr: [] };
        }

        let match = line.match(/^(msgctxt|msgid_plural|msgid)\s+"(.*)"$/);

        if (match) {
            field = match[1];
            entry[field] = unescape(match[2]);

            return;
        }

        match = line.match(/^msgstr(?:\[(\d+)\])?\s+"(.*)"$/);

        if (match) {
            field = `msgstr${match[1] || '0'}`;
            entry.msgstr[Number(match[1] || 0)] = unescape(match[2]);

            return;
        }

        match = line.match(/^"(.*)"$/);

        if (match && field) {
            const value = unescape(match[1]);

            if (field.startsWith('msgstr')) {
                const index = Number(field.slice(6));

                entry.msgstr[index] = (entry.msgstr[index] || '') + value;

                return;
            }

            entry[field] += value;
        }
    });

    push();

    return entries.filter((item) => item.msgid !== '' || item.msgstr.length > 0);
};

const headerValue = (entries, name) => {
    const header = entries.find((entry) => entry.msgid === '');

    if (!header) {
        return '';
    }

    const match = (header.msgstr[0] || '').match(new RegExp(`^${name}:\\s*(.*)$`, 'mi'));

    return match ? match[1].trim() : '';
};

const catalogue = (entries, locale, pluralForms) => {
    const messages = {
        '': {
            domain: 'messages',
            lang: locale,
            'plural-forms': pluralForms || 'nplurals=2; plural=(n != 1);',
        },
    };
    let count = 0;

    entries.forEach((entry) => {
        if (entry.msgid === '' || entry.msgstr.every((value) => !value)) {
            return;
        }

        const key = entry.msgctxt ? `${entry.msgctxt}${CONTEXT_GLUE}${entry.msgid}` : entry.msgid;

        messages[key] = entry.msgid_plural
            ? Array.from(entry.msgstr, (value) => value || '')
            : [entry.msgstr[0] || ''];
        count += 1;
    });

    return { messages, count };
};

const write = (file, payload) => {
    fs.writeFileSync(path.join(dir, file), `${JSON.stringify(payload)}\n`);
};

const run = () => {
    if (!fs.existsSync(dir)) {
        console.log('  languages/ is missing, nothing to convert');

        return;
    }

    const catalogues = fs.readdirSync(dir)
        .filter((name) => name.endsWith('.po') && name.startsWith(`${slug}-`));

    if (catalogues.length === 0) {
        console.log('  languages/*.po  none yet, no JSON to build');

        return;
    }

    catalogues.forEach((name) => {
        const locale = name.slice(slug.length + 1, -3);
        const entries = parsePo(fs.readFileSync(path.join(dir, name), 'utf8'));
        const pluralForms = headerValue(entries, 'Plural-Forms');
        const revision = headerValue(entries, 'PO-Revision-Date');

        const owned = entries.filter((entry) => entry.references.some(OWNS));
        const { messages, count } = catalogue(owned, locale, pluralForms);

        if (count === 0) {
            return;
        }

        const payload = {
            'translation-revision-date': revision,
            generator: 'stackvane-video-import-for-divi/toolchain/build-json.js',
            source: SOURCE,
            domain: 'messages',
            locale_data: { messages },
        };
        const hashed = crypto.createHash('md5').update(SOURCE).digest('hex');

        write(`${slug}-${locale}-${HANDLE}.json`, payload);
        write(`${slug}-${locale}-${hashed}.json`, payload);

        console.log(`  languages/${slug}-${locale}-${HANDLE}.json  ${count} strings (also as ${hashed})`);
    });
};

run();
