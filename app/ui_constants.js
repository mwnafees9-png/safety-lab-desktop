// ui_constants.js — UI label / color / icon constants, extracted verbatim from safety_lab.js
// (Phase 76). Pure data, loaded FIRST so bare-name references resolve. Byte-identical.

const DAL_COLORS = { A: '#dc3545', B: '#f97316', C: '#eab308', D: '#fcd34d', E: '#cbd5e1' };

const AC_WORKSPACE_TABS = {
    'ac-func': 'func', 'ac-fcim': 'fcim', 'ac-fha': 'fha', 'ac-req': 'req', 'ac-asm': 'asm'
};

const CMA_MODE_LABELS = {
    'design':            'Design',
    'software':          'Software',
    'manufacturing':     'Manufacturing',
    'hardware-component':'Hardware component',
    'environment':       'Environment',
    'power':             'Power',
    'cooling':           'Cooling',
    'installation':      'Installation',
    'maintenance':       'Maintenance',
    'specification':     'Specification',
    'testing':           'Testing',
    'human-factors':     'Human factors',
    'shared-resource':   'Shared resource'
};

const FMEA_FUNC_MODE_LABELS = {
    'loss':              'Loss of function',
    'loss-of-integrity': 'Loss of integrity (erroneous output)',
    'inadvertent':       'Inadvertent function',
    'degraded':          'Degraded function',
    'loss-and-erroneous':'Loss + erroneous'
};

const FMEA_SCOPE_LABELS = { 'aircraft': 'Aircraft', 'system': 'System' };

const FMEA_SCOPE_COLORS = {
    'aircraft': { bg: 'rgba(0, 122, 255, 0.12)', fg: 'var(--color-accent)' },
    'system':   { bg: 'rgba(139, 92, 246, 0.14)', fg: '#8b5cf6' }
};

const TREE_LEVEL_LABELS = { 'aircraft': 'Aircraft', 'system': 'System', 'standalone': 'Standalone', 'subtree': 'Subtree', 'verification': 'Verification' };

const TREE_LEVEL_COLORS = {
    'aircraft':   { bg: 'rgba(10, 132, 255, 0.16)',  fg: '#0a84ff' },
    'system':     { bg: 'rgba(175, 82, 222, 0.16)',  fg: '#af52de' },
    'standalone': { bg: 'rgba(142, 142, 147, 0.16)', fg: '#8e8e93' },
    // Phase 53.37 — transferred-out pages render with this badge regardless of their actual treeLevel.
    'subtree':    { bg: 'rgba(245, 158, 11, 0.16)',  fg: '#c2680a' },
    // Phase 53.46 — verification mirror pages render with a green badge (passes implementation
    // values upward to verify the apportioned targets on the source allocation tree).
    'verification': { bg: 'rgba(52, 199, 89, 0.16)', fg: '#1f7a3a' }
};

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ⓘ' };
