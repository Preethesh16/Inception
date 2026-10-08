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
