# Inception presenter guide

Use the new CSVs in demo-data/three-hospital. A is Kaveri, B is Chamundi,
D is Mandya. These files have identical histories to the original demonstration;
stock and delivery timing support the following scenarios.

All hospitals start with adequate own stock. Chamundi and Mandya deliberately
have spare ORS above protected demand, so there is a genuine donor. This is
different from the earlier zero-surplus baseline. Kaveri's opening stock is
balanced, and no approvals are pre-created.

## Preparation

1. Press **Done — reset demo** in Backend workflow before each independent scenario.
   This restores all three original CSVs, dates, reports, approvals and transfers.
   It also invalidates logins. It leaves all three hospitals onboarded.
2. Log into Kaveri: admin@kaveri.demo / Demo@2026.
   If starting from the onboarding reset instead, upload A-hospital.csv first.
   Chamundi and Mandya are already loaded with their corresponding CSVs.
3. Wait until the current analysis completes. Keep scenario date at 5 October 2026.
4. For reports from other hospitals use separate browser profiles/private sessions.
   Do not log out of Kaveri during a scenario: its logout resets its demo import.
5. Leave transfer proposals **unapproved** while demonstrating rerouting.
   An approved/reserved or dispatched transfer is a different operational state.

## 1. Low stock: Kaveri receives from Chamundi

In Kaveri → Inventory management → Oral rehydration salts:
- Set A-ORS-01 quantity to **50**.
- Set A-ORS-02 quantity to **50**.
- Keep expiry dates unchanged. Enter an audit reason and save each change.

After analysis finishes, Kaveri has 100 sachets and a forecast shortage.
Backend workflow → Find donor should choose **Chamundi → Kaveri**, the closest
eligible hospital with spare stock. Show the calculated agreement in Approvals.
Do not approve it if continuing directly to the reporting scenario.

## 2. Surplus: Kaveri sends usable near-expiry stock

Reset first. In Kaveri → Inventory management:
- Set **A-ORS-01 to 3,000** sachets.
- Keep its expiry at **17 October 2026**.
- Leave A-ORS-02 at its baseline **2,440**.

This creates forecasted unused near-expiry stock, not merely a large number.
The expiry-rescue search finds a recipient that can use it before expiry.
Both tested forecast modes proposed **Kaveri → Mandya**. Quantity is calculated
from the forecast and may differ between modes.
Pip and the agreement explain why these units are safe to release.

For a separate long-life surplus demonstration, reset and increase A-ORS-02
instead. That triggers a surplus search, but a transfer is not guaranteed when
other hospitals have no unmet need. Do not present an unnecessary stock move as
a successful optimization.

## 3. Reported outbreak: reroute to Mandya

Reset, then repeat scenario 1 with both Kaveri ORS lots set to 50.
Show Chamundi as the first donor; leave the proposal unapproved.

1. From Kaveri, select **Report outbreak**, choose **Oral rehydration salts**, submit.
2. From Chamundi's separate session (admin@chamundi.demo / Demo@2026),
   report the same product.
3. Wait for analysis and look at the latest proposal, not an obsolete version.

Kaveri and Chamundi are close enough to share one operational planning zone.
Chamundi cannot donate ORS inside that zone. **Mandya remains outside it**,
so the new safe route is **Mandya → Kaveri**.

Kaveri's report alone can already exclude Chamundi because Chamundi is within
the 2 km boundary. Chamundi's additional report corroborates and expands their
shared boundary; it need not be the first moment rerouting occurs.

On the dashboard's Onboarding page, the nearby-hospitals map now draws the
backend's exact red dashed planning boundaries. Click a circle or zone button
for Pip's explanation. Marker colour remains supply risk, not outbreak status.

### Optional final safety-stop scenario

Report ORS from Mandya too (admin@mandya.demo / Demo@2026).
Its matching report expands the **same continuous planning zone** to cover
Mandya and the distance to Mysuru. The dashboard map shades the whole area.
This is an operational boundary, not confirmed disease spread. Mandya can no longer donate ORS, so **no safe donor** is the correct
result until a zone is cleared or another eligible source becomes available.

## Reset

Press Done — reset demo. All three hospitals return to these scenario-ready
CSV quantities and original dates; edits, reports, agreements and transfers
are cleared. Log in again before the next presentation. Files named
A-hospital-no-shortage.csv or A-hospital-balanced.csv from older work are not
this three-hospital scenario kit.

These are synthetic operational demonstrations, not clinical outbreak diagnoses.

## Before agreements reach Approvals

Each allocation candidate now passes a joint negotiation check. The recipient
simulates usage alongside confirmed arrivals and earlier proposed transfers;
the donor's protected demand, batch eligibility and reserves are rechecked.
Offers are reduced to the largest feasible whole-pack quantity within the
allocator's limit, or discarded when no quantity is feasible. This runs on a
private simulation: it does not sign either hospital's approval or reserve real
stock. Each published agreement records this check in its conversation.
Approval-time revalidation remains necessary if inputs change afterward.
