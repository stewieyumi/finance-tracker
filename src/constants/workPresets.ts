// Work presets suggest terminology only. They never create income or restrict tools.
export const WORK_PRESETS = {
  employee: { label: "Employee", description: "Salary, bonuses, and side work.", inflows: "SALARY & BONUSES", gigs: "SIDE HUSTLES", inflowCats: ["Salary", "Bonus", "13th Month", "Reimbursement", "Other"], gigCats: ["Freelance", "Tutoring", "Online Selling", "Other"] },
  videographer: { label: "Creative / Multimedia", description: "Shoots, edits, and creative projects.", inflows: "RECEIVABLES & INFLOWS", gigs: "UPCOMING SHOOTS & GIGS", inflowCats: ["Salary", "Shoot", "Edit", "Payment", "Other"], gigCats: ["Solo Shoot", "Assistant", "Video Edit", "Event", "Commercial", "Other"] },
  freelance: { label: "Freelancer", description: "Client projects, retainers, and consulting.", inflows: "INVOICES & PAYMENTS", gigs: "FREELANCE PROJECTS", inflowCats: ["Retainer", "Project", "Consulting", "Other"], gigCats: ["Project", "Consulting", "Retainer", "Design", "Other"] },
  business: { label: "Business / Self-employed", description: "Sales, services, and customer payments.", inflows: "SALES & PAYMENTS", gigs: "ORDERS & TASKS", inflowCats: ["Sales", "Service", "Customer Payment", "Refund", "Other"], gigCats: ["Order", "Service", "Delivery", "Admin", "Other"] },
  personal: { label: "Personal / Student", description: "Allowance, gifts, and everyday spending.", inflows: "INCOME & ALLOWANCE", gigs: "TASKS & HUSTLES", inflowCats: ["Allowance", "Salary", "Gift", "Side Hustle", "Other"], gigCats: ["Part-time", "Errand", "Online Selling", "Other"] },
};
export type WorkPreset = keyof typeof WORK_PRESETS;
