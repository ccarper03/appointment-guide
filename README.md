# Appointment Guide · Collins Ridge

A private iPad reference for in-person appointments. It replaces the printed binder.
It does not replace the DRH Dashboard or the Inventory Dashboard.

Live at `charlescarper.com/appointment-guide/` (hidden, not indexed).

## What's in it

- **Menu.** Find a home, site map, payment compare, next steps, library, quick answers.
- **Talk track.** NEPQ stages with questions, tone, pace, pauses and "done when" checks, plus objections.
  Behind the passcode and encrypted in this repo. The small lines icon on the menu opens it.
- **Find a home.** Filter plans, open a floor plan, see the homes for sale and the open lots for it.
- **Site map.** Every lot in this phase by status. Toggle each status, filter by plan, sort by price or lot.
- **Payment compare.** FHA 3.5%, Conventional 5/10/20%, VA. Today's rate vs. the BFC rate, shown as a range,
  with the monthly gap. Same method as the drhorton.com calculator. Homes with the 2/1 buydown show year 1, year 2 and
  years 3–30. "What the incentive is worth" charts the first five years against today's rate, with what the buyer
  keeps and the incentive as a price cut.
- **Guest card + WWREA.** The buyer fills it in and signs on the iPad. You press and hold to take it back,
  check the relationship box, then Save to Files. The PDF is named
  `WWREA - Last, First (& Second) - YYYY-MM-DD.pdf`.

## Keeping it current (on the iPad, no code)

Open **Settings** from the menu footer.

| What changed | Where |
|---|---|
| Today's rates | Rates: copy Conventional, FHA and VA from the drhorton.com calculator on any home. |
| BFC rates or lists | Builder rates (BFC) by closing month: FHA, VA and Conv rates plus the lots on each month's list. The next 3 months show on their own and roll forward; a new month shows up blank until you fill it. |
| Buydown special | Buydown special: the type (2/1, 3/2/1 or 1/0), the lot(s) management picked, the note rate per program (blank uses the home's BFC rate), and the close-by date. |
| Closing cost help | Closing cost help: up to $ for homes for sale (being built or done) and up to $ for presales. Presale quotes (custom price, open lots) never get BFC or the buydown. |
| Lot statuses | Update lots: import the CSV from the homesales console snippet. |
| Build stages, prices | Update lots: import your inventory pull CSV. |
| Agent box on the WWREA | WWREA agent section: name, license, firm, default relationship box. |

These changes save on that iPad only. **Reset** puts the built-in values back.

## Passcode

- **Save it.** Safari offers to save the passcode in Passwords when you unlock. Say yes.
- **Change it yourself.** Settings → Change passcode. Make the file, save `talk-locked.js`, upload it to the
  `data` folder here on GitHub (Add file → Upload files → Commit). A few minutes later the new passcode works
  and the old one stops working everywhere.

## Privacy

- Buyer info stays on the iPad. It is cleared when you tap **Done · clear buyer info**.
- The signed PDF goes only where you save it.
- The repo is public on GitHub's free plan, so the talk track is encrypted (AES-GCM, PBKDF2 key).
  The passcode is never stored in the repo.
- The library holds buyer-facing documents only.

## Rebuilding the data

`build_data.py` (kept outside this repo) rebuilds `data/app-data.js`, `data/talk-locked.js`,
the plan images, the site map and the library. After a rebuild, bump `CACHE` in `sw.js`
and the `?v=` numbers in `index.html` so iPads pick up the new files.
