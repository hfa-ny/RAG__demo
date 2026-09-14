# Secure Campus AI Demo: Questions and Expected Answers

Use these questions to test retrieval, cross-document synthesis, exceptions, and
the assistant's handling of information outside the document collection. Generated
wording may vary; judge an answer by whether it includes the facts listed below.
Open **View Retrieved Source Documents** after each response and confirm that the
named source passages were retrieved.

## A note about classification terminology

The collection contains two classification schemes:

- The short demonstration file `data_classification_guidelines.txt` uses
  **Tier 1: Highly Restricted**, **Tier 2: Confidential**, and **Tier 3: Public**.
- The official 2024 `CUNY-Data-Classification-Standard.pdf` uses
  **Confidential**, **Sensitive/Internal**, and **Public**.

The questions below name the intended source when that difference could affect
the expected answer.

## 1. Standard hardware allocation and refresh deadline

**Test type:** Precise lookup with several facts

**Question**

> What is the standard hardware budget for a new full-time faculty member, how often is the device eligible for replacement, and when must a refresh request be submitted?

**Expected answer**

A full-time tenure-track faculty member or full-time lecturer is eligible for a
primary device upon hire, with a maximum standard allocation of **$1,850**. The
device is eligible for replacement every **four years**, and the refresh request
must reach the IT Helpdesk no later than **April 1 of the eligibility year**.

**Expected source:** `faculty_hardware_procurement.txt`, sections 1 and 2.

## 2. Specialized workstation exception

**Test type:** Apply an exception instead of the general limit

**Question**

> I teach in the Computer Science department and need a $3,000 workstation. Is that permitted, and what approval is required?

**Expected answer**

Yes. Computer Science is one of the departments that may request a
**High-Performance Workstation allocation up to $3,200**. The request requires a
**signed justification form from the Department Chair**.

**Expected source:** `faculty_hardware_procurement.txt`, section 3.

## 3. Peripheral budget and return of old equipment

**Test type:** Combine two sections of one policy

**Question**

> How much can a faculty member spend on approved peripherals, how often is that budget available, and how soon must an old computer be returned after a refresh?

**Expected answer**

The peripheral budget is **$300 every two years** and covers items such as
external monitors, keyboards, mice, and approved webcams. After receiving a new
device during a refresh, the old device must be returned to IT Asset Management
within **14 business days**.

**Expected source:** `faculty_hardware_procurement.txt`, sections 4 and 5.

## 4. Public AI use for grading

**Test type:** Policy restriction and approved alternative

**Question**

> May an instructor use a public AI service to grade student essays, and what alternative does the Generative AI policy permit?

**Expected answer**

No. Instructors may not use public AI platforms to grade student essays or exams.
Automated grading must use the University's approved, on-premise **Secure Campus
AI** environment. Student grades are FERPA-protected information and must not be
entered into a public AI prompt.

**Expected source:** `ai_acceptable_use_policy.txt`, sections 2 and 3.

## 5. Official CUNY data classifications

**Test type:** Structured summary from the official PDF

**Question**

> According to the official CUNY Data Classification Standard PDF, what are the three data classifications, and what is the default for data that is neither Confidential nor Public?

**Expected answer**

The classifications are **Confidential** for high risk or impact,
**Sensitive/Internal** for moderate-to-low risk or impact, and **Public** for
little or no risk or impact. Data that is neither Confidential nor Public should
be treated as **Sensitive/Internal**.

**Expected source:** `CUNY-Data-Classification-Standard.pdf`, page 4, section 6.

## 6. FERPA records and directory information

**Test type:** Classification rule with an exception

**Question**

> Under the official CUNY Data Classification Standard, how should identifiable grades and other FERPA education records be classified, and how is FERPA directory information treated?

**Expected answer**

Identifiable education records such as class rosters, test scores, grades, and
financial-aid information are **Confidential**. FERPA directory information is
normally **Sensitive/Internal**, but directory information withheld at a
student's request is **Confidential**.

**Expected source:** `CUNY-Data-Classification-Standard.pdf`, pages 7 and 10,
Appendices A.3 and B.

## 7. University data in personal cloud accounts

**Test type:** Cloud restriction by classification

**Question**

> Can I put CUNY Confidential or Sensitive/Internal data in a self-provisioned personal cloud account? What about Public data?

**Expected answer**

Self-provisioned personal cloud accounts **may not** be used for Confidential or
Sensitive/Internal data. Public data may be published, processed, created,
collected, stored, and archived in the cloud without restriction, although
integrity, availability, or access protections may still be appropriate.

**Expected source:**
`CUNY-Acceptable-Use-of-University-Data-in-the-Cloud-Standard.pdf`, pages 5–6,
sections 6 and 6.1.

## 8. Email forwarding to a personal account

**Test type:** Prohibition with a limited manual alternative

**Question**

> May CUNY email be automatically forwarded to a personal email account? Is manually forwarding an individual message ever allowed?

**Expected answer**

Email sent to a CUNY mailbox must not be automatically forwarded to a non-CUNY
address. A selected message may be forwarded manually only when doing so does not
inappropriately disclose Sensitive or Confidential data, does not automatically
delete the message from the CUNY server, and complies with CUNY's acceptable-use
policy. The recommended alternative is to configure a device or email application
to access multiple accounts without forwarding.

**Expected source:** `CUNY-Email-Autoforwarding-Prohibition-Standard.pdf`, page 3,
sections 6.0–6.2.

## 9. Password requirements by account type

**Test type:** Compare several account types

**Question**

> What are the minimum password lengths and expiration periods for regular user, administrative, and service accounts under the CUNY Password Standard?

**Expected answer**

- Regular user passwords must be at least **13 characters**, expire at least
  every **180 days**, and have MFA enabled.
- Administrative account passwords must be at least **20 characters**, expire at
  least every **60 days**, and have MFA enabled.
- Service account passwords must be at least **20 characters** and expire at
  least every **180 days** and whenever an administrator leaves CUNY.

The standard also requires applicable passwords to include lowercase, uppercase,
numeric, and special characters and not match any of the previous 12 passwords.

**Expected source:** `CUNY-Password-Standard.pdf`, pages 2–3, sections 2.1.1 and
2.3.1.

## 10. Information outside the collection

**Test type:** Grounding and refusal

**Question**

> What is CUNY's reimbursement rate for faculty using a personal cell phone while traveling internationally?

**Expected answer**

The assistant should state that the supplied documents do not contain that
information. It should **not invent a reimbursement rate or policy**. Retrieved
passages may be unrelated because similarity search always returns nearby chunks;
the answer should still recognize that the context is insufficient.

**Expected source:** None; this information is outside the current collection.
