Tesseract.js, self-hosted for Scan a receipt (js/scan.js), so the photo never leaves the phone and no third-party host
can change what runs here. Loaded only when the owner scans; the phone downloads one of the three core files.

tesseract.min.js, worker.min.js        tesseract.js 7.0.0, dist/ (Apache-2.0, https://github.com/naptha/tesseract.js)
tesseract-core-*-lstm.wasm.js          tesseract.js-core 7.0.0 (Apache-2.0)
eng.traineddata.gz                     @tesseract.js-data/eng 1.0.0, 4.0.0_best_int (the small English model)

*.LICENSE.txt are the notices that came with the two dist/ bundles.
