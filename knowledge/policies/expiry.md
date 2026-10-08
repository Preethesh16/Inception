---
version: '1.0'
sources:
  - resource: inception://policy/1.0
    title: Enforced operational policy
type: Policy
title: Expiry-aware redistribution
tags: [expiry, batches, FEFO]
status: stable
resource: inception://policy/1.0/expiry
---
# Expiry-aware redistribution
Consume earliest-expiry eligible batches first. A transfer must retain more than two days of shelf life after arrival and be consumable by the recipient before expiry. Near expiry is not itself evidence of waste.
Quarantined stock, incorrect units, and incompatible storage cannot be transferred.
Quantities are base units and proposals must use whole packs.

## Negotiating incoming batches
Before accepting a counteroffer, use `evaluate_received_offer` to ask the inventory simulator how much can be consumed before the offered batches expire. It uses the recipient's current history-based planning forecast, own inventory, reservations, confirmed arrivals, transport time and FEFO ordering. The tool returns per-batch predicted consumption, additional waste and a useful quantity rounded down to whole packs. Counteroffer that smaller quantity when necessary; decline if no useful whole pack fits. A forecast check does not retrain Chronos when consumption history has not changed. Cite the forecast run and policy version. Both administrators still approve the resulting version.
