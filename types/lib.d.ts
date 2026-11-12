// The ES modules in js/lib/ hand their exports to the classic scripts as globals (Object.assign(window, ...) at the
// end of each). These say so to the type checker, and take each signature from the module itself, so there is one
// definition of each function and the classic scripts are checked against it.
declare const esc: typeof import("../js/lib/text.js").esc;
declare const safeUrl: typeof import("../js/lib/text.js").safeUrl;
declare const editDistance: typeof import("../js/lib/text.js").editDistance;
declare const fmtDate: typeof import("../js/lib/text.js").fmtDate;
declare const orderOptsText: typeof import("../js/lib/text.js").orderOptsText;

declare const ELO_BASE: typeof import("../js/lib/elo.js").ELO_BASE;
declare const PLACING: typeof import("../js/lib/elo.js").PLACING;
declare const eloFor: typeof import("../js/lib/elo.js").eloFor;
declare const matchCount: typeof import("../js/lib/elo.js").matchCount;
declare const isProvisional: typeof import("../js/lib/elo.js").isProvisional;
declare const kFor: typeof import("../js/lib/elo.js").kFor;
declare const pairKey: typeof import("../js/lib/elo.js").pairKey;
declare const expectedScore: typeof import("../js/lib/elo.js").expectedScore;
declare const eloStep: typeof import("../js/lib/elo.js").eloStep;
declare const placementPos: typeof import("../js/lib/elo.js").placementPos;
declare const placementElo: typeof import("../js/lib/elo.js").placementElo;
declare const placementStep: typeof import("../js/lib/elo.js").placementStep;

declare const ORDER_LANGS: typeof import("../js/lib/order.js").ORDER_LANGS;
declare const SWEET_LEVELS: typeof import("../js/lib/order.js").SWEET_LEVELS;
declare const sweetLevel: typeof import("../js/lib/order.js").sweetLevel;
declare const orderLines: typeof import("../js/lib/order.js").orderLines;
declare const orderLangFor: typeof import("../js/lib/order.js").orderLangFor;

declare const parseReceipt: typeof import("../js/lib/scan.js").parseReceipt;
declare const receiptLines: typeof import("../js/lib/scan.js").receiptLines;
declare const lineItem: typeof import("../js/lib/scan.js").lineItem;

declare const CROP_SMALL: typeof import("../js/lib/crop.js").CROP_SMALL;
declare const CROP_MID: typeof import("../js/lib/crop.js").CROP_MID;
declare const findReceipt: typeof import("../js/lib/crop.js").findReceipt;
declare const foundCorners: typeof import("../js/lib/crop.js").foundCorners;
declare const quadOk: typeof import("../js/lib/crop.js").quadOk;
declare const quadSize: typeof import("../js/lib/crop.js").quadSize;
declare const flatten: typeof import("../js/lib/crop.js").flatten;
