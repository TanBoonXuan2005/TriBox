INSERT INTO sites (owner_id, name, domain_url, api_key, subscription_tier)
VALUES (
  gen_random_uuid(),
  'Test Shop',
  'http://localhost:5500',
  'test_key_123',
  'free'
);
