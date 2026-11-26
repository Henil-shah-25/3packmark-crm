'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  DollarSign,
  Tag,
  Briefcase,
  AlertCircle,
  Check,
} from 'lucide-react';
import { PipelineStage, TeamMember } from '@/types/crm';
import { MagneticButton } from '@/components/ui/MagneticButton';
import {
  POPULAR_COUNTRIES,
  CountryOption,
  formatToE164,
  isValidPhone,
} from '@/lib/phone';
import { CountryCode } from 'libphonenumber-js';

interface NewDealModalProps {
  stages: PipelineStage[];
  members: TeamMember[];
  defaultStageId?: string;
  onClose: () => void;
  onCreate: (dealData: any) => Promise<void>;
}

export function NewDealModal({
  stages,
  members,
  defaultStageId,
  onClose,
  onCreate,
}: NewDealModalProps) {
  const [activeTab, setActiveTab] = useState<'contact' | 'business'>('contact');

  // Contact tab state
  const [contactName, setContactName] = useState('');
  const [designation, setDesignation] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(POPULAR_COUNTRIES[0]); // India +91 default
  const [rawPhone, setRawPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(true);

  // Business tab state
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('1-10');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('India');
  const [address, setAddress] = useState('');
  const [gstTaxId, setGstTaxId] = useState('');
  const [leadSource, setLeadSource] = useState('Phone Call');
  const [servicesInterested, setServicesInterested] = useState<string[]>([]);
  const [estimatedBudget, setEstimatedBudget] = useState('0');
  const [notes, setNotes] = useState('');

  // Deal / Pipeline state
  const [title, setTitle] = useState('');
  const [stageId, setStageId] = useState(defaultStageId || stages[0]?.id || 'stg-new-lead');
  const [ownerId, setOwnerId] = useState(members[0]?.id || 'mem-1');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [expectedCloseDate, setExpectedCloseDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [tagsInput, setTagsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const servicesList = [
    'Web Development',
    'CRM Implementation',
    'Mobile App',
    'UI/UX Design',
    'Cloud / DevOps',
    'AI Consulting',
    'SEO / Marketing',
  ];

  const handlePhoneChange = (val: string) => {
    setRawPhone(val);
    if (val && !isValidPhone(val, selectedCountry.code)) {
      setPhoneError('Please enter a valid phone number');
    } else {
      setPhoneError('');
    }
    if (sameAsPhone) {
      setWhatsappNumber(val);
    }
  };

  const handleCountryChange = (codeStr: string) => {
    const countryObj = POPULAR_COUNTRIES.find((c) => c.code === codeStr) || POPULAR_COUNTRIES[0];
    setSelectedCountry(countryObj);
    if (rawPhone && !isValidPhone(rawPhone, countryObj.code)) {
      setPhoneError('Invalid number for selected country');
    } else {
      setPhoneError('');
    }
  };

  const handleToggleService = (srv: string) => {
    setServicesInterested((prev) =>
      prev.includes(srv) ? prev.filter((s) => s !== srv) : [...prev, srv]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = contactName.trim();
    const trimmedCompany = company.trim();

    // Required: Name OR Company only
    if (!trimmedName && !trimmedCompany) {
      alert('Please enter either a Contact Name or a Company Name.');
      return;
    }

    if (rawPhone && !isValidPhone(rawPhone, selectedCountry.code)) {
      setPhoneError('Please correct the phone number before saving');
      setActiveTab('contact');
      return;
    }

    setIsSubmitting(true);
    try {
      const e164Phone = rawPhone ? formatToE164(rawPhone, selectedCountry.code) : '';
      const e164AltPhone = alternatePhone ? formatToE164(alternatePhone, selectedCountry.code) : '';
      const e164Whatsapp = sameAsPhone
        ? e164Phone
        : whatsappNumber
        ? formatToE164(whatsappNumber, selectedCountry.code)
        : '';

      const effectiveTitle = title.trim() || `${trimmedCompany || trimmedName} Opportunity`;
      const budgetNum = parseFloat(estimatedBudget) || 0;

      await onCreate({
        title: effectiveTitle,
        contactName: trimmedName || trimmedCompany,
        designation: designation.trim(),
        email: email.trim(),
        phone: e164Phone,
        alternatePhone: e164AltPhone,
        whatsappNumber: e164Whatsapp,
        whatsappSameAsPhone: sameAsPhone,
        countryCode: selectedCountry.dialCode,

        company: trimmedCompany || trimmedName,
        industry: industry.trim(),
        companySize,
        website: website.trim(),
        city: city.trim(),
        state: state.trim(),
        country: country.trim(),
        address: address.trim(),
        gstTaxId: gstTaxId.trim(),
        leadSource,
        servicesInterested,
        estimatedBudget: budgetNum,
        notes: notes.trim(),

        value: budgetNum,
        stageId,
        ownerId,
        priority,
        expectedCloseDate,
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      });

      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to create lead');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasNameOrCompany = Boolean(contactName.trim() || company.trim());

  return (
    <div
      className="scrim fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="card p-6 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col space-y-4 animate-in fade-in zoom-in-95 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-base font-bold text-[var(--text-ink)]">
              Create New Opportunity
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Add contact and business details to your pipeline. Only{' '}
              <strong className="text-[var(--text-ink)]">Name OR Company</strong> is required.
            </p>
          </div>
          <MagneticButton
            onClick={onClose}
            className="btn btn--subtle btn--icon rounded-full"
            title="Close"
          >
            <X className="w-4 h-4 text-[var(--text-ink)]" />
          </MagneticButton>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1.5 p-1 bg-[var(--bg-main)] rounded-2xl border border-[var(--border-subtle)] text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('contact')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'contact'
                ? 'bg-[var(--solid)] text-[var(--text-ink)] shadow-2xs font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Contact Details</span>
            {contactName.trim() && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'business'
                ? 'bg-[var(--solid)] text-[var(--text-ink)] shadow-2xs font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Business Details</span>
            {company.trim() && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {activeTab === 'contact' && (
            <div className="space-y-3.5 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Contact Name */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Full Name <span className="text-[var(--brand)] font-normal">(Required if company blank)</span>
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                    />
                  </div>
                </div>

                {/* Designation */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Designation / Role
                  </label>
                  <div className="relative">
                    <Briefcase className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Managing Director"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                    />
                  </div>
                </div>

                {/* Phone Number with selectable Country Code */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Phone (E.164 Standard)
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={selectedCountry.code}
                      onChange={(e) => handleCountryChange(e.target.value)}
                      className="w-24 px-2 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] text-xs focus:outline-none shrink-0"
                    >
                      {POPULAR_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.dialCode}
                        </option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <Phone className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={rawPhone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        placeholder="e.g. 98765 43210"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                      />
                    </div>
                  </div>
                  {phoneError ? (
                    <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {phoneError}
                    </p>
                  ) : rawPhone ? (
                    <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Stored as {formatToE164(rawPhone, selectedCountry.code)}
                    </p>
                  ) : null}
                </div>

                {/* Alternate Phone */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Alternate Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={alternatePhone}
                    onChange={(e) => setAlternatePhone(e.target.value)}
                    placeholder="e.g. +91 91234 56789"
                    className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>

                {/* WhatsApp Number & Same as Phone Toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[11px] text-[var(--text-muted)]">
                      WhatsApp Number
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sameAsPhone}
                        onChange={(e) => {
                          setSameAsPhone(e.target.checked);
                          if (e.target.checked) setWhatsappNumber(rawPhone);
                        }}
                        className="rounded accent-[var(--ink)]"
                      />
                      <span>Same as phone</span>
                    </label>
                  </div>
                  <input
                    type="tel"
                    disabled={sameAsPhone}
                    value={sameAsPhone ? rawPhone : whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder={sameAsPhone ? 'Synced with main phone' : 'e.g. 98765 43210'}
                    className={`w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] ${
                      sameAsPhone ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'business' && (
            <div className="space-y-3.5 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Company Name */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Company Name <span className="text-[var(--brand)] font-normal">(Required if name blank)</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="e.g. Apex Technologies"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                    />
                  </div>
                </div>

                {/* Industry */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Industry
                  </label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. FinTech / SaaS"
                    className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>

                {/* Company Size */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Company Size
                  </label>
                  <select
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                    className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                  >
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="500+">500+ Enterprise</option>
                  </select>
                </div>

                {/* Website */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Website URL
                  </label>
                  <div className="relative">
                    <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://apextech.com"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                    />
                  </div>
                </div>

                {/* City & State */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    City & State
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City (e.g. Mumbai)"
                      className="w-1/2 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                    />
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State (e.g. Maharashtra)"
                      className="w-1/2 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                    />
                  </div>
                </div>

                {/* Country */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. India"
                    className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>

                {/* GST / Tax ID */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    GST / Tax ID
                  </label>
                  <input
                    type="text"
                    value={gstTaxId}
                    onChange={(e) => setGstTaxId(e.target.value)}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>

                {/* Lead Source */}
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Lead Source
                  </label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                  >
                    <option value="Phone Call">Phone Call</option>
                    <option value="Visit">Visit</option>
                    <option value="Cold Call">Cold Call</option>
                    <option value="Seminar">Seminar</option>
                  </select>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Full Business Address
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Office suite, building, street..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>
              </div>

              {/* Services Interested In */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1.5">
                  Services Interested In
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {servicesList.map((srv) => {
                    const isSelected = servicesInterested.includes(srv);
                    return (
                      <button
                        key={srv}
                        type="button"
                        onClick={() => handleToggleService(srv)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--ink)] text-[var(--bg-card)] border-transparent'
                            : 'bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-ink)] border-[var(--border-subtle)]'
                        }`}
                      >
                        {srv}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Opportunity & Pipeline Settings (Available across both tabs) */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
            <span className="text-[10px] font-bold text-[var(--text-muted)] block">
              Deal & Pipeline Settings
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Optional Custom Deal Title */}
              <div className="sm:col-span-3">
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Opportunity Title <span className="font-normal text-[var(--text-muted)]">(Auto-generated if left blank)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={company.trim() || contactName.trim() ? `${company.trim() || contactName.trim()} Opportunity` : 'e.g. Mobile App Redesign'}
                  className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                />
              </div>

              {/* Value / Budget */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Estimated Value / Budget ($)
                </label>
                <div className="relative">
                  <DollarSign className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    value={estimatedBudget}
                    onChange={(e) => setEstimatedBudget(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] font-tabular focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>
              </div>

              {/* Pipeline Stage */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Pipeline Stage
                </label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.probability}%)
                    </option>
                  ))}
                </select>
              </div>

              {/* Owner */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Deal Owner
                </label>
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                  {members.length === 0 && <option value="mem-1">Default Rep</option>}
                </select>
              </div>

              {/* Close Date */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Target Close Date
                </label>
                <input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Tags (comma separated)
                </label>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Q4, Inbound, High-Value"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>
              </div>
            </div>

            {/* Initial Note */}
            <div>
              <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                Initial Note / Context
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Key requirements, client context, next action..."
                className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
              />
            </div>
          </div>

          {/* Footer Submit Bar */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] mt-2">
            <p className="text-[11px] text-[var(--text-muted)]">
              {!hasNameOrCompany ? (
                <span className="text-amber-600">Enter a Contact Name or Company to proceed</span>
              ) : (
                <span className="text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Ready to create deal
                </span>
              )}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full border border-[var(--border-subtle)] hover:bg-[var(--solid)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!hasNameOrCompany || isSubmitting}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all shadow-sm cursor-pointer ${
                  hasNameOrCompany && !isSubmitting
                    ? 'bg-[var(--ink)] text-[var(--bg-card)] hover:opacity-90'
                    : 'bg-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed'
                }`}
              >
                {isSubmitting ? 'Creating...' : 'Create Opportunity'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
