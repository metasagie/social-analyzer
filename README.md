<p align="center"> <img src="https://raw.githubusercontent.com/qeeqbox/social-analyzer/main/readme/socialanalyzerlogo_.png"></p>

Social Analyzer - API, CLI, and Web App for analyzing & finding a person's profile across +1000 social media \ websites. It includes different analysis and detection modules, and you can choose which modules to use during the investigation process.

The detection modules utilize a rating mechanism based on different detection techniques, which produces a rate value that starts from 0 to 100 (No-Maybe-Yes). This module is intended to have fewer false positives.

The analysis and public extracted information from this OSINT tool could help investigate profiles related to suspicious or malicious activities such as cyberbullying, cyber grooming, cyberstalking, and spreading misinformation.

`This project is currently used by some law enforcement agencies in countries where resources are limited - The detection database is different than the one shared here..`

---

# Head Hunter Agency

**Head Hunter Agency** is the investigation console shipped with this repository. It is a professional web app wrapped around the
social-analyzer engine: it adds target intake, source selection, live streaming of every source check, first-party verification
through official APIs, case files, exports and a network status board — while the original CLI, REST endpoints and classic console
keep working exactly as before.

```
  Head Hunter Agency — Social footprint intelligence console
  Console : http://0.0.0.0:9005/          <- the new app
  Classic : http://0.0.0.0:9005/app.html  <- original web app
  API     : http://0.0.0.0:9005/api/health
```

## Quick start

```bash
npm install --ignore-scripts     # geckodriver's binary download is not needed for fast/live scans
npm start                        # node app.js --gui  (binds 0.0.0.0:9005)
# open http://localhost:9005
```

### What the console does

| Capability | Detail |
| --- | --- |
| Target intake | Single handle or comma-separated groups, `⌘K` / `Ctrl+K` shortcut |
| Source selection | 999 platforms, curated presets (top 10/25/50/100, social, dev, music, video, games, dating, photo, news, shopping, education, forums, adult) or a hand-picked list |
| Live pipeline | Every check streams to the UI over server-sent events: `[LIVE]`, `[SANDBOX]`, `[BLOCKED]`, `[CHALLENGE]` decisions with latency and reason |
| Detection engine | Upstream rating engine (0–100: no / maybe / yes) over 1,821 detection techniques, `high` sensitivity profile |
| First-party verification | Official **GitHub**, **PyPI** and **npm** APIs: avatar, bio, company, location, followers, account age, repositories, languages, declared social accounts, published packages |
| Identity intelligence | Offline handle analysis: tokenisation (prefix/name/number/symbol), name origins, possible age, archetype scoring |
| Case files | Every run is sealed as `HHA-YYYYMMDD-XXXXX` under `runtime/cases/` and is re-openable from the case library |
| Exports | JSON (full case), CSV (findings) and a Markdown investigation report |
| Network board | Live reachability probe across 16 top-traffic hosts with latency, block reason and remediation advice |
| Settings | Proxy, user-agent, GitHub token and Google keys are stored server-side in `runtime/settings.json` (never returned to the browser) |

### Provenance is always explicit

A finding is either real or it is not, and the interface never blurs the two:

| Tag | Meaning |
| --- | --- |
| `live` | A real HTTPS response was captured during this run and parsed by the detection engine. |
| `synthetic` (**sandbox**) | The source could not be reached from this deployment, so a deterministic offline fixture was generated. Every fixture is badged in the UI and tagged `provenance:"synthetic"` in exports. Fixtures are **not evidence** — they exist so the workflow can be evaluated on filtered networks. |
| `challenge` | The host answered with an anti-bot / JavaScript interstitial; no profile data could be read. Reported as inconclusive. |
| blocked | Connection reset, refused, DNS failure or timeout. Reported honestly instead of guessed. |

Collection modes: **Hybrid** (real requests first, badged fixtures for unreachable sources), **Strict live** (nothing is simulated)
and **Sandbox** (offline demo data, no outbound traffic at all).

Most restricted networks can be turned into fully-live ones by setting an HTTP/SOCKS proxy in **Settings** — that is the single
biggest lever on coverage. The case file records live vs sandbox coverage per run.

### REST API

The console is a thin client over JSON endpoints mounted at `/api` (full reference in the **API & CLI** view of the app):

```bash
# start an investigation and stream it
curl -s -X POST http://localhost:9005/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"targets":"torvalds","presets":["top25"],"mode":"auto"}'
# -> {"job":"job_ab12cd34","stream":"/api/stream/job_ab12cd34"}

curl -N http://localhost:9005/api/stream/job_ab12cd34      # SSE: snapshot, log, progress, done
curl -s http://localhost:9005/api/cases                    # case library
curl -s "http://localhost:9005/api/cases/HHA-20261008-XXXXX/export?format=md" > report.md
```

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Status, engine versions, counters, egress summary |
| GET | `/api/overview` | Dashboard aggregates, presets, connectors, activity |
| GET | `/api/sites` | Source database with filters (search, category, country, nsfw, connector, sort) |
| GET | `/api/presets` · `/api/facets` | Curated selections and category/country facets |
| GET | `/api/probe?force=1` | Reachability probe across top-traffic hosts |
| POST | `/api/scan/preview` · `/api/scan` | Estimate a run · start a run |
| GET | `/api/stream/:job` | Server-sent events for a running job |
| POST | `/api/scan/:job/cancel` | Cancel a run |
| GET/DELETE | `/api/cases` · `/api/cases/:id` | Case library and case files |
| GET | `/api/cases/:id/export?format=json\|csv\|md` | Exports |
| GET/POST | `/api/settings` | Proxy, user-agent, tokens, module toggles, default sources |
| POST | `/api/lookup/:handle` | First-party enrichment (GitHub / PyPI / npm) |
| GET | `/api/identity/:handle` | Offline handle intelligence |

### Layout of the addition

```
app.js                     # server + CLI (mounts the gateway, binds 0.0.0.0 by default)
modules/gateway.js         # REST API, scan orchestration, case assembly, exports
modules/connectors.js      # first-party GitHub / PyPI / npm connectors + probes
modules/synthesis.js       # deterministic sandbox fixtures + exposure scoring
modules/jobs.js            # job registry with server-sent-event streaming
modules/cases.js           # case files (runtime/cases)
public/index.html          # Head Hunter Agency console
public/assets/css/hha.css  # design system
public/assets/js/          # core.js (client, charts) · views.js (templates) · main.js (shell)
runtime/                   # settings.json + case files (git-ignored, disposable)
```

### Deployment notes

* The web app binds `0.0.0.0:9005` by default; override with `--host` / `--port` (or `PORT`).
* Behind a proxy set `HTTPS_PROXY` style values in the **Settings** dialog, or edit `runtime/settings.json`.
* A GitHub token raises API rate limits for the connector layer (60 → 5,000 requests/hour).
* Slow/advanced scanning (Selenium + Firefox, OCR) is unchanged and still requires the browser drivers from the upstream
  install instructions below; the console's default pipeline is fast/live and needs no browser.

---

## So·cial Me·di·a
Websites and applications that enable users to create and share content or to participate in social networking - Oxford Dictionary

## Structure
<img src="https://raw.githubusercontent.com/qeeqbox/social-analyzer/main/readme/structure.png">


## APP (Preferred!)
Standard localhost WEB APP url: http://0.0.0.0:9005/app.html

<img src="https://raw.githubusercontent.com/qeeqbox/social-analyzer/main/readme/intro_fast.gif" style="max-width:768px"/>

## CLI 
<img src="https://raw.githubusercontent.com/qeeqbox/social-analyzer/main/readme/cli.gif" style="max-width:768px"/>

## Features
- String & name analysis (Permutations and Combinations)
- Find a profile using multiple techniques (HTTPS library & Webdriver)
- Multi profile search (Used for correlation - any combination separated with "," )
- Multilayers detections (OCR, normal, advanced & special)
- Visualized profile information using Ixora (Metadata & Patterns)
- Metadata & Patterns extraction (Added from Qeeqbox OSINT project)
- Force-directed Graph for Metadata (Needs ExtractPatterns)
- Search by top ranking or by country (Alexa Ranking)
- Search by type (adult, music, etc.. - automated websites stats)
- Profiles stats and static info (Category country)
- Cross Metadata stats (Added from Qeeqbox OSINT project)
- Auto-flirtation to unnecessary output (Enable javascript etc..)
- Search engine lookup (Google API - optional)
- Custom search queries (Google API & DuckDuckGo API - optional)
- Profile screenshot, title, info, and website description
- Find name origins, name similarity & common words by language
- Find possible profile\person age (Limited analysis)
- Custom user-agent, proxy, timeout & implicit wait
- Python CLI & NodeJS CLI (limited to FindUserProfilesFast option)
- Screenshots of detected profile (The latest version of Chrome must be installed)
- Grid option for faster checking (limited to docker-compose)
- Dump logs to folder or terminal (prettified)
- Adjust finding\getting profile workers (default 15)
- Re-checking option for failed profiles
- Filter profiles by good, maybe, and bad
- Save the analysis as a JSON file
- Simplified web interface and CLI
- And, more!!

## Special Detections
- Facebook (Phone number, name, or profile name)
- Gmail (example@gmail.com)
- Google (example@example.com)

## Install & Run
### Linux (As Node WebApp)
```bash
sudo apt-get update
#Depedning on your Linux distro, you may or may not need these 2 lines
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y software-properties-common
sudo add-apt-repository ppa:mozillateam/ppa -y
sudo apt-get install -y firefox-esr tesseract-ocr git nodejs npm
git clone https://github.com/qeeqbox/social-analyzer.git
cd social-analyzer
npm update
npm install
npm start
```

### Linux (As Node CLI)
```bash
sudo apt-get update
#Depedning on your Linux distro, you may or may not need these 2 lines
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y software-properties-common
sudo add-apt-repository ppa:mozillateam/ppa -y
sudo apt-get install -y firefox-esr tesseract-ocr git nodejs npm
git clone https://github.com/qeeqbox/social-analyzer.git
cd social-analyzer
npm install
nodejs app.js --username "johndoe"
#or
nodejs app.js --username "johndoe,janedoe" --metadata
#or
nodejs app.js --username "johndoe,janedoe" --metadata --top 100
#or
nodejs app.js --username "johndoe" --type "adult"
```

### Linux (As python package)
```bash
sudo apt-get update
sudo apt-get install python3 python3-pip
pip3 install social-analyzer
python3 -m social-analyzer --username "johndoe"
#or
python3 -m social-analyzer --username "johndoe" --metadata
#or
python3 -m social-analyzer --username "johndoe" --metadata --top 100
#or
python3 -m social-analyzer --username "johndoe" --type "adult"
#or
python3 -m social-analyzer --username "johndoe" --websites "car" --logs --screenshots
```

### Linux (As python script)
```bash
sudo apt-get update
sudo apt-get install git python3 python3-pip
git clone https://github.com/qeeqbox/social-analyzer
cd social-analyzer
pip3 install -r requirements.txt
python3 app.py --username "janedoe"
#or
python3 app.py --username "johndoe" --metadata
#or
python3 app.py --username "johndoe" --metadata --top 100
#or
python3 app.py --username "johndoe" --type "adult"
#or
python3 app.py --username "johndoe" --websites "car" --logs --screenshots
```

### Importing as object (python)
```python

#E.g. #1
from importlib import import_module
SocialAnalyzer = import_module("social-analyzer").SocialAnalyzer()
results = SocialAnalyzer.run_as_object(username="johndoe",silent=True)
print(results)

#E.g. #2
from importlib import import_module
SocialAnalyzer = import_module("social-analyzer").SocialAnalyzer()
results = SocialAnalyzer.run_as_object(username="johndoe,janedoe",silent=True,output="json",filter="good",metadata=False,timeout=10, profiles="detected")
print(results)
```

### Linux, Windows, MacOS, Raspberry pi..
- check this [wiki](https://github.com/qeeqbox/social-analyzer/wiki/install) for all possible installation methods
- check this [wiki](https://github.com/qeeqbox/social-analyzer/wiki/integration) for integrating social-analyzer with your OSINT tools, feeds, etc...

## social-analyzer --h
```
Required Arguments:
  --username   E.g. johndoe, john_doe or johndoe9999

Optional Arguments:
  --websites    A website or websites separated by space E.g. youtube, tiktokor tumblr
  --mode        Analysis mode E.g.fast -> FindUserProfilesFast, slow -> FindUserProfilesSlow or special -> FindUserProfilesSpecial
  --output      Show the output in the following format: json -> json outputfor integration or pretty -> prettify the output
  --options     Show the following when a profile is found: link, rate, titleor text
  --method      find -> show detected profiles, get -> show all profiles regardless detected or not, all -> combine find & get
  --filter      Filter detected profiles by good, maybe or bad, you can do combine them with comma (good,bad) or use all
  --profiles    Filter profiles by detected, unknown or failed, you can do combine them with comma (detected,failed) or use all
  --countries   select websites by country or countries separated by space as: us br ru
  --type        Select websites by type (Adult, Music etc)
  --top         select top websites as 10, 50 etc...[--websites is not needed]
  --extract     Extract profiles, urls & patterns if possible
  --metadata    Extract metadata if possible (pypi QeeqBox OSINT)
  --trim        Trim long strings
  --gui         Reserved for a gui (Not implemented)
  --cli         Reserved for a cli (Not needed)

Listing websites & detections:
  --list        List all available websites

Setting:
  --headers     Headers as dict
  --logs_dir    Change logs directory
  --timeout     Change timeout between each request
  --silent      Disable output to screen
```

## Open Shell
[![Open in Cloud Shell](https://img.shields.io/static/v1?label=%3E_&message=Open%20in%20Cloud%20Shell&color=3267d6&style=flat-square)](https://ssh.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/qeeqbox/social-analyzer&tutorial=README.md) [![Open in repl.it Shell](https://img.shields.io/static/v1?label=%3E_&message=Open%20in%20repl.it%20Shell&color=606c74&style=flat-square)](https://repl.it/github/qeeqbox/social-analyzer)

## Resources
- DuckDuckGo API, Google API, NodeJS, bootstrap, selectize, jQuery, Wikipedia, font-awesome, selenium-webdriver & tesseract.js
- Let me know if I missed a reference or resource!

## Disclaimer\Notes
- Download this project from GitHub and treat it as a security project
- If you want your website to be excluded from this project list, please reach out to me
- This tool is meant to be used locally, not as a service (It does not have any Access Control)
- For issues related to modules that end with -private or under the private group ![](https://raw.githubusercontent.com/qeeqbox/social-analyzer/main/readme/modules.png), reach out directly to me (do not open an issue on GitHub)

## Other Projects
[![](https://github.com/qeeqbox/.github/blob/main/data/analyzer.png)](https://github.com/qeeqbox/analyzer) [![](https://github.com/qeeqbox/.github/blob/main/data/chameleon.png)](https://github.com/qeeqbox/chameleon) [![](https://github.com/qeeqbox/.github/blob/main/data/honeypots.png)](https://github.com/qeeqbox/honeypots) [![](https://github.com/qeeqbox/.github/blob/main/data/osint.png)](https://github.com/qeeqbox/osint) [![](https://github.com/qeeqbox/.github/blob/main/data/url-sandbox.png)](https://github.com/qeeqbox/url-sandbox) [![](https://github.com/qeeqbox/.github/blob/main/data/mitre-visualizer.png)](https://github.com/qeeqbox/mitre-visualizer) [![](https://github.com/qeeqbox/.github/blob/main/data/woodpecker.png)](https://github.com/qeeqbox/woodpecker) [![](https://github.com/qeeqbox/.github/blob/main/data/docker-images.png)](https://github.com/qeeqbox/docker-images) [![](https://github.com/qeeqbox/.github/blob/main/data/seahorse.png)](https://github.com/qeeqbox/seahorse) [![](https://github.com/qeeqbox/.github/blob/main/data/rhino.png)](https://github.com/qeeqbox/rhino) [![](https://github.com/qeeqbox/.github/blob/main/data/raven.png)](https://github.com/qeeqbox/raven) [![](https://github.com/qeeqbox/.github/blob/main/data/image-analyzer.png)](https://github.com/qeeqbox/image-analyzer)
