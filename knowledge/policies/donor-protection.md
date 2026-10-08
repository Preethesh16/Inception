---
type: Policy
title: Donor protection
tags: [inventory, allocation, reserve]
status: stable
resource: inception://policy/1.0/donor-protection
generated: {by: 'process:inception-policy-export', at: '2026-10-08T00:00:00Z'}
---
# Donor protection
Policy version 1.0 protects the higher daily planning path for the larger of seven days or supplier lead time plus two days, plus one normal-demand day. Protection beyond 28 days cannot be automatically established.
The daily P90 sum is a conservative scenario, not a calibrated 90% total-demand guarantee.
An allocation cap also protects competing recipients. Negotiation cannot override it.
The executable policy lives in typed backend configuration. This document explains it; it cannot change it.
See [expiry](expiry.md) and [stock-out](/metrics/stockout.md).
