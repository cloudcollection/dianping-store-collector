<div align="center">
  <img src="extension/icons/icon128.png" width="80" alt="Dianping Store Collector">
  <h1>Dianping Store Collector</h1>
  <p>Collect Dianping search results, store details, group-buy offers, and vouchers from Edge or Chrome.</p>
  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-2.0.0-356DF3">
    <img alt="Python" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white">
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-8C67E8"></a>
  </p>
</div>

The extension works in a browser session you already use and saves records to your own MongoDB instance. It keeps a fixed store queue, so a paused task can continue without starting the search again.

It does not export cookies, solve verification challenges, or send collected data to a hosted service.

## Screenshots

<div align="center">
  <img src="docs/assets/sidepanel-preview.png" width="360" alt="Side panel">
  &nbsp;&nbsp;
  <img src="docs/assets/popup-preview.png" width="336" alt="Toolbar popup">
</div>

The current interface is in Chinese.

## What it collects

- Store results from a bounded search range
- Store name, ratings, address, average price, tags, and recommended dishes
- Group-buy offers and vouchers shown on the store page
- Task position and completion state for pause and resume
- Relevant response evidence, subject to local size and retention limits

A store is marked complete only after its store record, offers, and completion record have all been written. If parsing or storage fails, the task stays on the current store and pauses.

## Setup

Requirements:

- Windows 10 or 11
- Edge or Chrome 120+
- Python 3.10+
- MongoDB 6.0+

The default MongoDB address is `mongodb://127.0.0.1:27017`. Set `DIANPING_MONGO_URI` before startup if you use a different local address.

Open PowerShell in the project directory:

```powershell
.\setup.ps1
.\start.ps1
```

The service prints a pairing token when it starts. Keep the terminal open and do not share the token.

To load the extension in Edge:

1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `extension` directory.
4. Open the side panel and paste the pairing token.

Use `chrome://extensions` for Chrome.

## Task controls

A task can specify the city, keyword, first and last page, starting item, target store count, and whether offers should be collected.

Two pacing profiles are included:

| Profile | Action delay | Batch size | Batch break |
|---|---:|---:|---:|
| Fast | 10–20 s | 3–7 | 30–90 s |
| Cautious | 30–90 s | 2–5 | 90–240 s |

The extension pauses on recognized login, slider, CAPTCHA, and access-restriction pages, and on HTTP 401, 403, 406, 429, or 503 responses.

## Stored data

The default database is `dianping_collector`.

| Collection | Contents |
|---|---|
| `shops` | Latest snapshot for each store |
| `search_results` | Search results and fixed queue positions |
| `deals` | Group-buy offers and vouchers |
| `shop_commits` | Completed-store records used during recovery |
| `network_captures` | Metadata and local paths for captured evidence |

The `shops` collection retains the field names used by the original project:

```text
店铺id、店铺名、评论总数、人均价格、标签、店铺地址、
店铺均分、推荐菜、店铺总分、优惠券信息、最后采集时间、首次采集时间
```

Full captured responses are stored locally rather than duplicated in MongoDB. The default limit is 250 MB with a 14-day retention period.

## Export

CSV downloads use a single-use ticket that expires after 60 seconds. Values beginning with spreadsheet formula characters are written as text.

## Tests

```powershell
.\test.ps1
```

The repository contains 24 Python tests and four JavaScript test scripts covering authentication, parsing, storage, export, queue recovery, pacing, and extension reinjection.

Tests use saved fixtures. Dianping changes its pages regularly, so check a new release against a small sample before relying on it. The current version has not completed a broad live-site compatibility run.

## Project layout

```text
backend/       FastAPI service, MongoDB storage, and parsers
extension/     Manifest V3 extension
tests/         Python and JavaScript tests
docs/assets/   README screenshots
```

## Use and limitations

This project is intended for small, supervised collection tasks. It does not include CAPTCHA bypass, cookie export, proxy rotation, automation concealment, or concurrent request flooding. Only collect data you are allowed to access and use.

The setup scripts currently target Windows PowerShell. Site changes may require parser or selector updates.

## License

This project modifies GPL-3.0 code from [Sniper970119/dianping_spider](https://github.com/Sniper970119/dianping_spider). The browser workflow, storage, interface, and tests have been substantially revised.

Licensed under the [GNU General Public License v3.0](LICENSE).
