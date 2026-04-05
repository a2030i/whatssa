-- Step 1: Unlink fake LID customers from group conversations
UPDATE conversations 
SET customer_id = NULL 
WHERE customer_phone IN ('120363226932806347','120363428437259861','120363422078251815');

-- Step 2: Delete fake customer records with LID numbers
DELETE FROM customers 
WHERE phone IN ('120363226932806347','120363428437259861','120363422078251815');