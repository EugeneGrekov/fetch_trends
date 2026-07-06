Create a local keyword validation tool for Google Autocomplete research.

Goal:
Help validate micro-business ideas by collecting Google Autocomplete predictions for many seed phrases in one batch.

Important:
This tool must not claim exact search volume.
Autocomplete is only a signal of search language and possible demand.
The tool should be polite to Google, avoid aggressive scraping, use delays, avoid bypassing anti-bot systems, and allow manual/browser-based use.

Core use case:
A user provides a list of seed phrases, for example:

find my parked car
app that remembers where I parked
automatic parking location app
Bluetooth parking location app Android
find parked car without opening app

The tool expands each seed phrase into many query prefixes, collects autocomplete predictions, deduplicates them, classifies intent, scores them, and exports CSV/JSON reports.

Build a CLI tool first.

Technology:
Use Node.js + TypeScript.
Use Playwright for browser-assisted autocomplete collection.
Use CSV and JSON export.
Keep the code clean and modular.

CLI examples:

Single seed:
npm run autocomplete -- --seed "find my parked car" --country US --language en --depth 2 --out ./results/parking.csv

Batch file:
npm run autocomplete -- --seeds ./data/parking-seeds.txt --country US --language en --depth 2 --out ./results/parking.csv

Multiple seed files:
npm run autocomplete -- --seeds ./data/parking.txt --seeds ./data/maps.csv --out ./results/mobility.csv

Pasted stdin:
pbpaste | npm run autocomplete -- --seeds - --out ./results/pasted.csv

Batch inline:
npm run autocomplete -- --seed "find my parked car" --seed "automatic parking location app" --seed "Bluetooth parking location app Android" --country US --language en --depth 2 --out ./results/parking.csv

Required inputs:

* seed: optional string, can be passed multiple times
* seeds: optional path to TXT or CSV file with seed phrases; can be passed multiple times
* at least one of seed or seeds is required
* country: default US
* language: default en
* depth: 1 or 2, default 1
* output path
* optional modifiers list
* optional headless true/false
* optional delayMs, default 1200
* optional maxPrefixes, default 500
* optional maxDepth2Prefixes, default 100
* optional resume true/false, default true

Input file behavior:

* TXT file: one seed phrase per line
* CSV file: read a column named seed
* Ignore empty lines
* Ignore duplicate seed phrases
* Trim spaces
* Preserve original seed phrase in output

Default modifiers:
automatic
automatically
app
Android
iPhone
Bluetooth
no tap
without opening app
best
alternative
not working
Google Maps
Apple Maps

Query expansion patterns for each seed:

1. seed
2. seed + space + each letter a-z
3. modifier + space + seed
4. seed + space + modifier
5. "how to " + seed
6. "best " + seed
7. seed + " app"
8. seed + " android"
9. seed + " iphone"
10. seed + " automatically"
11. seed + " not working"

Depth 1:
Use only generated prefixes for each seed.

Depth 2:
For every collected prediction from depth 1, run:
prediction + space + a-z

Limit depth 2 to maxDepth2Prefixes unless user passes a higher limit.

Batch behavior:

* Process seeds one by one.
* Show progress:
  current seed
  seed number out of total
  prefixes processed
  predictions collected
  unique predictions collected
* Save partial results during execution.
* If the run stops, support resume mode.
* Resume should skip prefixes already completed.
* If one seed fails, continue to the next seed and record the error.
* At the end, export one combined report and one per-seed summary.

Collection behavior:

* Open google.com or google.com/search in Playwright.
* Set interface language to English if possible.
* Use a clean browser context.
* Type each prefix into the search box.
* Wait for autocomplete dropdown.
* Extract visible autocomplete predictions.
* Store:
  original seed
  source prefix
  prediction
  timestamp
  country
  language
* Use random delay between requests.
* If Google blocks or shows CAPTCHA, stop collection safely and tell the user to continue manually.
* Do not bypass CAPTCHA or anti-bot systems.

Deduplication:
Normalize by:

* lowercase
* trim spaces
* remove duplicate spaces
* remove punctuation-only differences

Keep:

* normalized query
* original query
* all source seeds that produced it
* all source prefixes that produced it
* source seed count
* source prefix count

Intent classification:
Classify each prediction as one of:

* high purchase intent
* how-to intent
* comparison intent
* problem intent
* low intent

Rules:
High purchase intent if query contains:
app, tool, software, automatic, automatically, Bluetooth, no tap, without opening app, best, alternative, Android, iPhone

How-to intent if query starts with:
how to, can I, where, why, what is

Comparison intent if query contains:
best, alternative, vs, compare, review

Problem intent if query contains:
not working, forgot, lost, can't find, issue, problem, failed

Low intent if query mainly asks about:
free, settings, tutorial, Apple Maps settings, Google Maps settings

Add confidence score from 0 to 100:

* +25 if autocomplete phrase is exact and specific
* +20 if contains app, tool, or software
* +20 if contains automatic, automatically, no tap, or Bluetooth
* +15 if contains Android, iPhone, or another platform
* +15 if contains not working, forgot, lost, issue, or problem
* +10 if found from multiple prefixes
* +10 if found from multiple seed phrases
* -20 if query is only generic
* -20 if query is mainly about built-in settings
  Clamp score between 0 and 100.

Platform detection:

* iPhone if contains iphone, ios, apple maps, or carplay
* Android if contains android or google maps android
* Google Maps if contains google maps
* Apple Maps if contains apple maps
* unknown otherwise

Next validation step:

* high purchase intent: check Keyword Planner and Google page 1 competitors
* how-to intent: check if built-in or free solution solves it
* problem intent: search Reddit and app reviews for complaints
* comparison intent: analyze competitors and pricing
* low intent: keep only if it reveals useful wording

Output CSV columns:
query
normalized_query
intent
confidence_score
platform
source_seeds
source_seed_count
source_prefixes
source_prefix_count
country
language
timestamp
next_validation_step

Output JSON:
Include:

* run metadata
* input seeds
* generated prefixes
* collected predictions
* unique normalized predictions
* per-seed summaries
* errors
* final summary

Report summary:
After export, print:

* total seed phrases
* total prefixes generated
* total prefixes completed
* total predictions collected
* unique predictions
* top 30 by confidence
* count by intent
* count by platform
* strongest 20 high-purchase-intent queries
* strongest 20 problem-intent queries
* weak or low-intent queries to avoid
* top seed phrases by number of useful predictions
* recommended next validation action

Project structure:
src/
cli.ts
config.ts
loadSeeds.ts
expandQueries.ts
collectAutocomplete.ts
normalize.ts
classifyIntent.ts
exportCsv.ts
exportJson.ts
report.ts
resumeStore.ts
types.ts

Add:

* README.md with usage examples
* package.json scripts
* TypeScript config
* basic tests for seed loading, query expansion, normalization, and intent classification

Do not build a web UI yet.
Do not add paid APIs yet.
Do not estimate search volume.
Do not bypass Google blocking.
Do not hide limitations.

README must clearly say:
This tool validates search language, not exact demand size.
Autocomplete predictions are not monthly search volume.
Use Keyword Planner, Google Trends, Search Console, or SEO tools after this step.
