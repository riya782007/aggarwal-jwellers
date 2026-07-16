-- Aggarwal Jewellers — 0052: customers.address (QA fix).
-- The checkout & POS flows have always tried to store the customer's address, and the
-- Website Orders queue joins it for the delivery card — but the column never existed in
-- this schema, silently failing customer inserts and 400-ing the orders-queue query.
alter table public.customers add column if not exists address text;
