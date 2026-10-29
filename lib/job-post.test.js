import test from "node:test";
import assert from "node:assert/strict";
import { parseJobPost, redactContactDetails } from "./job-post.js";

test("extracts fields from a LinkedIn hiring post", () => {
  const post = `🚀 We’re Hiring: MERN Stack Developer | Mohali

Ready to build impactful web solutions? Join [****Esferasoft Solutions Pvt Ltd.****](https://www.linkedin.com/company/esferasoft/) and take your career further!

💻 Experience: 3–4 Years
📍 Location: Mohali, Punjab (Onsite)
📩 Apply: [**hrm@esferasoft.com**](mailto:hrm@esferasoft.com)`;

  assert.deepEqual(parseJobPost(post), {
    email: "hrm@esferasoft.com",
    role: "MERN Stack Developer",
    company: "Esferasoft Solutions Pvt Ltd.",
    location: "Mohali, Punjab (Onsite)",
    experience: "3–4 Years",
  });
});

test("redacts application contact details before a model request", () => {
  const sanitized = redactContactDetails(
    "Apply at hr@example.com or https://example.com/jobs. Call +1 (555) 123-4567.",
  );

  assert.equal(sanitized.includes("hr@example.com"), false);
  assert.equal(sanitized.includes("https://example.com/jobs"), false);
  assert.equal(sanitized.includes("+1 (555) 123-4567"), false);
  assert.match(sanitized, /\[email removed\]/);
  assert.match(sanitized, /\[link removed\]/);
  assert.match(sanitized, /\[phone number removed\]/);
});

test("does not mistake a mailto link for the company", () => {
  const parsed = parseJobPost(
    "MERN Stack Developer | Mohali\nApply: [Hiring team](mailto:hr@example.com)",
  );

  assert.equal(parsed.role, "MERN Stack Developer");
  assert.equal(parsed.email, "hr@example.com");
  assert.equal(parsed.company, "");
});
