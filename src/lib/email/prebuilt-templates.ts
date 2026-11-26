import { EmailTemplate } from '@/types/crm';

export const PREBUILT_TEMPLATES: Omit<EmailTemplate, 'id' | 'createdAt'>[] = [
  {
    workspaceId: 'ws-default',
    name: 'Company Introduction',
    category: 'outreach',
    isPrebuilt: true,
    subject: 'Introduction: {{my.company}} <> {{company.name}}',
    body: `<p>{{greeting}}</p>
<p>I hope you are having a productive week. I've been following the work you're doing at <strong>{{company.name}}</strong> and wanted to briefly introduce <strong>{{my.company}}</strong>.</p>
<p>We partner with high-growth teams to engineer reliable digital products, automate core pipelines, and accelerate time-to-market. Our engineering and design teams deliver measurable business impact with strict quality benchmarks.</p>
<p>Would you be open to a quick 10-minute discovery call this Thursday or Friday to explore if there is synergy?</p>
<p>Looking forward to connecting.</p>
{{my.signature}}`,
    plainText: `{{greeting}}

I hope you are having a productive week. I've been following the work you're doing at {{company.name}} and wanted to briefly introduce {{my.company}}.

We partner with high-growth teams to engineer reliable digital products, automate core pipelines, and accelerate time-to-market. Our engineering and design teams deliver measurable business impact with strict quality benchmarks.

Would you be open to a quick 10-minute discovery call this Thursday or Friday to explore if there is synergy?

Looking forward to connecting.

{{my.signature}}`,
    variables: ['greeting', 'company.name', 'my.company', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Portfolio Share',
    category: 'outreach',
    isPrebuilt: true,
    subject: 'Selected Work & Case Studies for {{company.name}}',
    body: `<p>{{greeting}}</p>
<p>Following up on my previous note, I wanted to share a few curated case studies that directly align with the technical challenges and scaling goals at <strong>{{company.name}}</strong>.</p>
<p>You can review our live client portfolio and production deliveries here:</p>
<p><a href="{{my.portfolio}}" style="display:inline-block;padding:10px 20px;background:#18181B;color:#FFFFFF;text-decoration:none;border-radius:9999px;font-weight:600;font-size:13px;">View Portfolio & Case Studies &rarr;</a></p>
<p>Or visit directly: <a href="{{my.portfolio}}">{{my.portfolio}}</a></p>
<p>Let me know if any of these architectures or case studies resonate with your current roadmap.</p>
{{my.signature}}`,
    plainText: `{{greeting}}

Following up on my previous note, I wanted to share a few curated case studies that directly align with the technical challenges and scaling goals at {{company.name}}.

You can review our live client portfolio and production deliveries here:
{{my.portfolio}}

Let me know if any of these architectures or case studies resonate with your current roadmap.

{{my.signature}}`,
    variables: ['greeting', 'company.name', 'my.portfolio', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'DROS Product Introduction (agency-focused)',
    category: 'sales',
    isPrebuilt: true,
    subject: 'Scaling Operations for {{company.name}} with DROS Delivery System',
    body: `<p>{{greeting}}</p>
<p>For agencies and engineering firms looking to scale delivery without ballooning operational overhead, bottlenecks in client onboarding and sprint handoffs are often the biggest barrier.</p>
<p>We designed the <strong>DROS (Dynamic Resilient Operations System)</strong> specifically to eliminate these bottlenecks. With DROS, agencies streamline client project workflows, unify client reporting, and guarantee predictable sprint deliveries.</p>
<p>Given your focus at <strong>{{company.name}}</strong> as {{lead.designation | "leader"}}, I think DROS could save your team dozens of hours every sprint.</p>
<p>Are you available for a brief walkthrough next Tuesday?</p>
{{my.signature}}`,
    plainText: `{{greeting}}

For agencies and engineering firms looking to scale delivery without ballooning operational overhead, bottlenecks in client onboarding and sprint handoffs are often the biggest barrier.

We designed the DROS (Dynamic Resilient Operations System) specifically to eliminate these bottlenecks. With DROS, agencies streamline client project workflows, unify client reporting, and guarantee predictable sprint deliveries.

Given your focus at {{company.name}} as {{lead.designation | "leader"}}, I think DROS could save your team dozens of hours every sprint.

Are you available for a brief walkthrough next Tuesday?

{{my.signature}}`,
    variables: ['greeting', 'company.name', 'lead.designation', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Missed Call Follow-up',
    category: 'follow_up',
    isPrebuilt: true,
    subject: 'Sorry I missed you earlier today, {{lead.firstName | "there"}}',
    body: `<p>{{greeting}}</p>
<p>I just tried giving you a quick call at <strong>{{lead.phone}}</strong> regarding <strong>{{deal.title}}</strong>, but wasn't able to catch you.</p>
<p>No urgency at all — I simply wanted to discuss how we can support <strong>{{company.name}}</strong> and share some initial ideas.</p>
<p>When you have a moment, please feel free to call me back at <strong>{{my.phone}}</strong> or reply to this email with a time that works best for you.</p>
<p>Have a wonderful rest of your day!</p>
{{my.signature}}`,
    plainText: `{{greeting}}

I just tried giving you a quick call at {{lead.phone}} regarding {{deal.title}}, but wasn't able to catch you.

No urgency at all — I simply wanted to discuss how we can support {{company.name}} and share some initial ideas.

When you have a moment, please feel free to call me back at {{my.phone}} or reply to this email with a time that works best for you.

Have a wonderful rest of your day!

{{my.signature}}`,
    variables: ['greeting', 'lead.phone', 'deal.title', 'company.name', 'my.phone', 'lead.firstName', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Meeting Confirmation',
    category: 'meeting',
    isPrebuilt: true,
    subject: 'Confirmed: Strategy Session on {{meeting.date}} at {{meeting.time}}',
    body: `<p>{{greeting}}</p>
<p>Thank you for coordinating with us. This confirms our upcoming strategy and discovery session for <strong>{{deal.title}}</strong>.</p>
<div style="background-color:#F5F3EF;border:1px solid #E2DFD8;border-radius:12px;padding:16px;margin:20px 0;">
  <p style="margin:0 0 6px 0;font-size:13px;"><strong>Date:</strong> {{meeting.date}}</p>
  <p style="margin:0 0 6px 0;font-size:13px;"><strong>Time:</strong> {{meeting.time}}</p>
  <p style="margin:0;font-size:13px;"><strong>Virtual Room:</strong> <a href="{{meeting.link}}" style="color:#0969DA;font-weight:600;">{{meeting.link}}</a></p>
</div>
<p>If you'd like to include any key team members from <strong>{{company.name}}</strong>, feel free to forward this invite or share their email addresses.</p>
<p>Looking forward to a great discussion!</p>
{{my.signature}}`,
    plainText: `{{greeting}}

Thank you for coordinating with us. This confirms our upcoming strategy and discovery session for {{deal.title}}.

Date: {{meeting.date}}
Time: {{meeting.time}}
Virtual Room: {{meeting.link}}

If you'd like to include any key team members from {{company.name}}, feel free to forward this invite or share their email addresses.

Looking forward to a great discussion!

{{my.signature}}`,
    variables: ['greeting', 'deal.title', 'meeting.date', 'meeting.time', 'meeting.link', 'company.name', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Meeting Reminder (30 min)',
    category: 'meeting',
    isPrebuilt: true,
    subject: 'Starting in 30 minutes: {{deal.title}} sync',
    body: `<p>{{greeting}}</p>
<p>This is a quick reminder that our session for <strong>{{deal.title}}</strong> begins in <strong>30 minutes</strong> at <strong>{{meeting.time}}</strong>.</p>
<p style="margin:20px 0;">
  <a href="{{meeting.link}}" style="display:inline-block;padding:12px 24px;background:#107569;color:#FFFFFF;text-decoration:none;border-radius:9999px;font-weight:bold;font-size:14px;">
    Join Google Meet &rarr;
  </a>
</p>
<p style="font-size:12px;color:#666;">Meeting Link: <a href="{{meeting.link}}">{{meeting.link}}</a></p>
<p>Looking forward to speaking shortly!</p>
{{my.signature}}`,
    plainText: `{{greeting}}

This is a quick reminder that our session for {{deal.title}} begins in 30 minutes at {{meeting.time}}.

Join Google Meet: {{meeting.link}}

Looking forward to speaking shortly!

{{my.signature}}`,
    variables: ['greeting', 'deal.title', 'meeting.time', 'meeting.link', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Post-Meeting Thank You',
    category: 'meeting',
    isPrebuilt: true,
    subject: 'Thank you for your time today, {{lead.firstName | "there"}}',
    body: `<p>{{greeting}}</p>
<p>Thank you very much for taking the time to speak today about <strong>{{deal.title}}</strong>. It was a pleasure learning more about your team's current focus at <strong>{{company.name}}</strong>.</p>
<p>As discussed, our next steps are to outline the recommended timeline and scope milestones. I will share a structured summary with you shortly.</p>
<p>In the meantime, please feel free to reach out if you have any questions or additional points you'd like us to consider.</p>
<p>Best regards,</p>
{{my.signature}}`,
    plainText: `{{greeting}}

Thank you very much for taking the time to speak today about {{deal.title}}. It was a pleasure learning more about your team's current focus at {{company.name}}.

As discussed, our next steps are to outline the recommended timeline and scope milestones. I will share a structured summary with you shortly.

In the meantime, please feel free to reach out if you have any questions or additional points you'd like us to consider.

Best regards,

{{my.signature}}`,
    variables: ['greeting', 'deal.title', 'company.name', 'lead.firstName', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Proposal Follow-up',
    category: 'sales',
    isPrebuilt: true,
    subject: 'Reviewing the proposal for {{deal.title}}',
    body: `<p>{{greeting}}</p>
<p>I wanted to follow up on the formal proposal we shared for <strong>{{deal.title}}</strong> (estimated at <strong>{{deal.value}}</strong>).</p>
<p>Have you and your team at <strong>{{company.name}}</strong> had a chance to review the scope, deliverables, and commercial terms?</p>
<p>We are very excited about this partnership and are ready to adjust any specific milestones to best match your Q4 priorities. Let me know if a quick sync would be helpful to address any questions.</p>
{{my.signature}}`,
    plainText: `{{greeting}}

I wanted to follow up on the formal proposal we shared for {{deal.title}} (estimated at {{deal.value}}).

Have you and your team at {{company.name}} had a chance to review the scope, deliverables, and commercial terms?

We are very excited about this partnership and are ready to adjust any specific milestones to best match your Q4 priorities. Let me know if a quick sync would be helpful to address any questions.

{{my.signature}}`,
    variables: ['greeting', 'deal.title', 'deal.value', 'company.name', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Gentle Check-in (weeks)',
    category: 'follow_up',
    isPrebuilt: true,
    subject: 'Quick check-in regarding {{deal.title}}',
    body: `<p>{{greeting}}</p>
<p>Hope you are having a wonderful month. I wanted to gently circle back on our conversation regarding <strong>{{deal.title}}</strong>.</p>
<p>I know priorities shift quickly at <strong>{{company.name}}</strong>, so I wanted to see if this project is still planned for the near term or if timing has shifted.</p>
<p>Whenever you have a moment, an update would be greatly appreciated.</p>
{{my.signature}}`,
    plainText: `{{greeting}}

Hope you are having a wonderful month. I wanted to gently circle back on our conversation regarding {{deal.title}}.

I know priorities shift quickly at {{company.name}}, so I wanted to see if this project is still planned for the near term or if timing has shifted.

Whenever you have a moment, an update would be greatly appreciated.

{{my.signature}}`,
    variables: ['greeting', 'deal.title', 'company.name', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Check-in (3 months)',
    category: 'follow_up',
    isPrebuilt: true,
    subject: 'Reconnecting with {{company.name}} — Q1 priorities',
    body: `<p>{{greeting}}</p>
<p>It has been a few months since we last connected, and I wanted to check in to see how everything is progressing at <strong>{{company.name}}</strong>.</p>
<p>Since we last spoke, <strong>{{my.company}}</strong> has launched several new frameworks and automated architectures that have significantly improved conversion rates and delivery speed for our partners.</p>
<p>Would it make sense to schedule a brief 15-minute catch-up to share updates and see if there are opportunities to collaborate this quarter?</p>
{{my.signature}}`,
    plainText: `{{greeting}}

It has been a few months since we last connected, and I wanted to check in to see how everything is progressing at {{company.name}}.

Since we last spoke, {{my.company}} has launched several new frameworks and automated architectures that have significantly improved conversion rates and delivery speed for our partners.

Would it make sense to schedule a brief 15-minute catch-up to share updates and see if there are opportunities to collaborate this quarter?

{{my.signature}}`,
    variables: ['greeting', 'company.name', 'my.company', 'my.signature'],
  },
  {
    workspaceId: 'ws-default',
    name: 'Check-in (6 months)',
    category: 'follow_up',
    isPrebuilt: true,
    subject: 'Catching up: updates from {{my.company}}',
    body: `<p>{{greeting}}</p>
<p>I hope the past half-year has been productive for you and the team at <strong>{{company.name}}</strong>.</p>
<p>We are reaching out to past connections to share some exciting developments at <strong>{{my.company}}</strong> and to see how your roadmap is shaping up for the upcoming cycle.</p>
<p>If you're evaluating any engineering or product initiatives, I'd love to reconnect and hear what you're building.</p>
<p>Wishing you continuous success!</p>
{{my.signature}}`,
    plainText: `{{greeting}}

I hope the past half-year has been productive for you and the team at {{company.name}}.

We are reaching out to past connections to share some exciting developments at {{my.company}} and to see how your roadmap is shaping up for the upcoming cycle.

If you're evaluating any engineering or product initiatives, I'd love to reconnect and hear what you're building.

Wishing you continuous success!

{{my.signature}}`,
    variables: ['greeting', 'company.name', 'my.company', 'my.signature'],
  },
];

