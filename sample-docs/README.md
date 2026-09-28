# Test documents

Three short files, 59–75 words each. Plain `.txt` — upload them as they are, no
conversion needed.

Each carries a fact you can check by eye, so you can tell immediately whether an
answer came from the document or was invented.

| File | Language | Category | The fact to check |
|---|---|---|---|
| `1_curp.txt` | Spanish | Immigration | Free · same day · RENAPO |
| `2_imss.txt` | Spanish | Healthcare | **7,450 pesos/year** · 4 weeks |
| `3_banking.txt` | English | Daily living | **Deliberately has no fee** |

Upload with **Applies to: All of Mexico**, or a user in another state will see nothing.

---

## What to ask, and what should come back

### 1_curp.txt → category **Immigration**

| Ask | Expect |
|---|---|
| How much does a CURP cost? | **Free** — the document says *gratuito* |
| Where do I get a CURP? | **RENAPO** |
| How long does a CURP take? | **Same day** |
| curp | Same answer — short fragments are expanded before searching |

### 2_imss.txt → category **Healthcare**

| Ask | Expect |
|---|---|
| How much is IMSS health insurance per year? | **7,450 pesos** |
| How long before I can see a doctor with IMSS? | **Four weeks** |

**7,450 is the number that matters.** No model would guess it. If it comes back
correctly, the answer genuinely came from your document — and grounding checked that the
digits appear in the source before showing them.

### 3_banking.txt → category **Daily living**

| Ask | Expect |
|---|---|
| What do I need to open a bank account? | Passport, residency card, proof of address, RFC |
| What is the minimum balance to open a bank account? | **"Not available"** — the document does not say |

The second one is the point of this file. The model knows plenty about Mexican banks. It
should still leave the field empty, because your document is silent.

### Nothing uploaded covers these

| Ask | Expect |
|---|---|
| Can I import my dog from Canada? | Honest refusal |
| How much does permanent residency cost? | Honest refusal |

Both then appear on **/admin** under *Questions with no answer*.

---

## Ask in any language

Retrieval is multilingual, so all of these find the same Spanish document:

```
How much does a CURP cost?
¿Cuánto cuesta la CURP?
Combien coûte la CURP au Mexique?
CURP कितने की है?
```

The answer always comes back in English — that is deliberate, and it is what the product
is for.

---

## The demo worth showing

1. Ask *"How much is IMSS insurance per year?"* before uploading — **refused**
2. Ask again — **still refused, now from cache**, instantly
3. Upload `2_imss.txt`, wait for **ready**
4. Ask the same question — **7,450 pesos, with the source named**

A gap closed in under a minute, and nothing was retrained.
