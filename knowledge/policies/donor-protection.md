---
version: '2.0'
sources:
  - resource: inception://policy/2.0
    title: Enforced operational policy
type: Policy
title: Donor protection
tags: [inventory, allocation, reserve]
status: stable
resource: inception://policy/2.0/donor-protection
generated: {by: 'process:inception-policy-export', at: '2026-10-08T00:00:00Z'}
---
# Donor protection
Policy version 2.0 protects a fixed 28-day inventory horizon, plus one normal-demand day expressed in units. Supplier lead time does not set this horizon. Empirical whole-path simulations additionally require shortage frequency at most 5% and expected unmet demand at most half a pack. These are provisional engineering thresholds, not validated clinical guarantees. Missing error history is explicitly labelled; deterministic protection still applies.

Near-expiry rescue can coexist with a later shortage only when all evaluated paths would otherwise waste the offered units and none suffer increased unmet demand. Long-life surplus is relative to the 28-day horizon and requires a useful recipient; it is not proof that stock will never be needed.
The daily P90 sum is a conservative scenario, not a calibrated 90% total-demand guarantee.
An allocation cap also protects competing recipients. Negotiation cannot override it.
The executable policy lives in typed backend configuration. This document explains it; it cannot change it.
See [expiry](expiry.md) and [stock-out](/metrics/stockout.md).
