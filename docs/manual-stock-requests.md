# Manual stock requests

Open **Stock requests** in the hospital dashboard.

1. Choose another hospital (listed by approximate straight-line distance), product,
   whole-pack quantity and reason.
2. The supplier sees the request in the same section. Its forecast assistant
   suggests a safe quantity and earliest eligible lots, excluding reservations
   and protecting its own forecast demand. This review is calculated from the
   inventory engine, not a free-form model guess.
3. A supplier administrator selects a quantity and **Agree and send offer**, or
   declines. The reply is visible to the requester. No stock is reserved yet.
4. The requester receives a fresh review of usage, arrivals, expiry and suggested
   quantity. A human can decline or **Accept offer and reserve stock**.
5. Accepting more than the forecast recommends requires an explicit exceptional-
   need reason. This is an audited manual exception to recipient-demand advice,
   never an override of donor coverage, available quantities, storage, outbreak
   restrictions or batch shelf-life constraints.
6. Acceptance records both hospitals' agreement and reserves the offered lots
   atomically. Follow dispatch and delivery in Approvals.

Offers are versioned: changed terms require a fresh review. Stock and expiry are
checked again at acceptance. Only the two involved hospitals can read or reply
to a request. Full demo reset clears the request inbox along with inventory,
reports and transfers. Requests and replies are internal application messages;
no email is sent.
