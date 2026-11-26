'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Video,
  ExternalLink,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Users,
  Building2,
  CalendarDays,
  CalendarRange,
  List,
  Edit2,
  Trash2,
  RotateCcw,
  Unplug,
} from 'lucide-react';
import { CalendarEvent, Lead, Workspace, TeamMember } from '@/types/crm';
import { sanitizeUrl, isSafeUrl } from '@/lib/security/validator';

interface CalendarViewProps {
  workspace: Workspace;
  calendarEvents: CalendarEvent[];
  leads: Lead[];
  members: TeamMember[];
  onScheduleMeeting: (eventData: any) => Promise<void>;
  onRescheduleMeeting?: (eventId: string, newStart: string, newEnd: string) => Promise<void>;
  onCancelMeeting?: (eventId: string) => Promise<void>;
  onRefreshEvents?: () => Promise<void>;
}

export function CalendarView({
  workspace,
  calendarEvents,
  leads,
  members,
  onScheduleMeeting,
  onRescheduleMeeting,
  onCancelMeeting,
  onRefreshEvents,
}: CalendarViewProps) {
  // Navigation & View mode
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day' | 'agenda'>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(2026, 9, 26)); // Fixed fallback for SSR
  const [isClient, setIsClient] = useState(false);

  // Tab mode in sidebar: upcoming vs past
  const [tabMode, setTabMode] = useState<'upcoming' | 'past'>('upcoming');

  // OAuth Connection status
  const [oauthStatus, setOauthStatus] = useState<{
    connected: boolean;
    email?: string;
    loading: boolean;
    error?: string;
  }>({
    connected: false,
    loading: true,
  });

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [reschedulingEvent, setReschedulingEvent] = useState<CalendarEvent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formLeadId, setFormLeadId] = useState('');
  const [formAttendees, setFormAttendees] = useState('');
  const [formDate, setFormDate] = useState('2026-10-27');
  const [formTime, setFormTime] = useState('14:00');
  const [formDurationMinutes, setFormDurationMinutes] = useState(45);
  const [formEnableMeet, setFormEnableMeet] = useState(true);
  const [formDescription, setFormDescription] = useState('');
  const [formTimezone, setFormTimezone] = useState('UTC');

  // Reschedule form states
  const [rescheduleDate, setRescheduleDate] = useState('2026-10-28');
  const [rescheduleTime, setRescheduleTime] = useState('15:00');

  useEffect(() => {
    setIsClient(true);
    const now = new Date();
    setSelectedDate(now);
    setFormDate(now.toISOString().split('T')[0]);
    setRescheduleDate(now.toISOString().split('T')[0]);
    try {
      setFormTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch (e) {
      setFormTimezone('UTC');
    }
    checkCalendarStatus();
  }, []);

  const checkCalendarStatus = async () => {
    try {
      const res = await fetch(`/api/calendar/status?workspaceId=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setOauthStatus({
          connected: data.connected,
          email: data.email,
          loading: false,
        });
      } else {
        setOauthStatus({ connected: false, loading: false });
      }
    } catch (err: any) {
      setOauthStatus({ connected: false, loading: false, error: err.message });
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const res = await fetch(`/api/calendar/auth?workspaceId=${workspace.id}`);
      if (res.ok) {
        const { authUrl } = await res.json();
        if (authUrl) {
          window.location.href = authUrl;
        }
      } else {
        alert('Could not initialize Google OAuth flow. Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
      }
    } catch (err: any) {
      alert('OAuth initialization error: ' + err.message);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm('Disconnect Google Calendar? Scheduled meetings will remain saved in Google Sheets.')) return;
    try {
      const res = await fetch(`/api/calendar/disconnect?workspaceId=${workspace.id}`, { method: 'POST' });
      if (res.ok) {
        setOauthStatus({ connected: false, loading: false });
      }
    } catch (err: any) {
      alert('Failed to disconnect: ' + err.message);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/calendar/sync?workspaceId=${workspace.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success && onRefreshEvents) {
        await onRefreshEvents();
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Lead selection auto-fills attendee
  const handleSelectLeadInForm = (leadId: string) => {
    setFormLeadId(leadId);
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      if (lead.email) setFormAttendees(lead.email);
      if (!formTitle) setFormTitle(`Discovery Call — ${lead.title} (${lead.company})`);
    }
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formDate || !formTime) return;
    setIsSubmitting(true);

    try {
      const startDateTime = new Date(`${formDate}T${formTime}:00`);
      const endDateTime = new Date(startDateTime.getTime() + formDurationMinutes * 60 * 1000);

      const attendeeList = formAttendees
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const meetingPayload = {
        title: formTitle,
        leadId: formLeadId || undefined,
        startIso: startDateTime.toISOString(),
        endIso: endDateTime.toISOString(),
        timezone: formTimezone,
        attendees: attendeeList,
        description: formDescription,
        createMeetLink: formEnableMeet,
        sendInviteEmails: true,
      };

      await onScheduleMeeting(meetingPayload);
      setShowScheduleModal(false);
      resetForm();
    } catch (err: any) {
      alert('Failed to schedule meeting: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingEvent || !rescheduleDate || !rescheduleTime) return;
    setIsSubmitting(true);
    try {
      const startDateTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      const originalDuration =
        new Date(reschedulingEvent.endIso).getTime() - new Date(reschedulingEvent.startIso).getTime();
      const endDateTime = new Date(startDateTime.getTime() + (originalDuration > 0 ? originalDuration : 45 * 60 * 1000));

      if (onRescheduleMeeting) {
        await onRescheduleMeeting(reschedulingEvent.id, startDateTime.toISOString(), endDateTime.toISOString());
      } else {
        await fetch(`/api/calendar/events/${reschedulingEvent.id}?workspaceId=${workspace.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startIso: startDateTime.toISOString(),
            endIso: endDateTime.toISOString(),
          }),
        });
        if (onRefreshEvents) await onRefreshEvents();
      }
      setReschedulingEvent(null);
    } catch (err: any) {
      alert('Failed to reschedule event: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteCancel = async (eventId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting and remove it from Google Calendar?')) return;
    try {
      if (onCancelMeeting) {
        await onCancelMeeting(eventId);
      } else {
        await fetch(`/api/calendar/events/${eventId}?workspaceId=${workspace.id}`, {
          method: 'DELETE',
        });
        if (onRefreshEvents) await onRefreshEvents();
      }
    } catch (err: any) {
      alert('Cancellation failed: ' + err.message);
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormLeadId('');
    setFormAttendees('');
    setFormDescription('');
  };

  // Date navigation helpers
  const handlePrev = () => {
    const next = new Date(selectedDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() - 1);
    else if (viewMode === 'week') next.setDate(next.getDate() - 7);
    else next.setDate(next.getDate() - 1);
    setSelectedDate(next);
  };

  const handleNext = () => {
    const next = new Date(selectedDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() + 1);
    else if (viewMode === 'week') next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  // Sort upcoming vs past meetings
  const nowIso = isClient ? new Date().toISOString() : '2026-10-26T00:00:00.000Z';
  const upcomingMeetings = calendarEvents
    .filter((e) => e.endIso >= nowIso && e.status !== 'cancelled')
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());

  const pastMeetings = calendarEvents
    .filter((e) => e.endIso < nowIso || e.status === 'cancelled')
    .sort((a, b) => new Date(b.startIso).getTime() - new Date(a.startIso).getTime());

  const displayedListMeetings = tabMode === 'upcoming' ? upcomingMeetings : pastMeetings;

  // Render Month Grid
  const renderMonthGrid = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Blank days for previous month
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`blank-${i}`} className="min-h-[100px] bg-[#FAF8F2]/40 border-b border-r border-[#E3DCCF]/40 p-2 opacity-30" />);
    }

    // Days of current month
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dayDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dayEvents = calendarEvents.filter((e) => e.startIso.startsWith(dayDateStr) && e.status !== 'cancelled');
      const isToday = isClient && new Date().toISOString().startsWith(dayDateStr);

      days.push(
        <div
          key={`day-${dayNum}`}
          className={`min-h-[110px] bg-white border-b border-r border-[#E3DCCF] p-2 hover:bg-[#FAF8F2] transition-colors flex flex-col justify-between ${
            isToday ? 'bg-[#FCF7E6]/40 ring-1 ring-[#F2C94C]' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                isToday ? 'bg-[#262720] text-white shadow-2xs' : 'text-[#262720]'
              }`}
            >
              {dayNum}
            </span>
            {dayEvents.length > 0 && (
              <span className="text-[10px] font-semibold text-[#2F5C50] bg-[#EBF2EE] px-2 py-0.5 rounded-full border border-[#2F5C50]/20">
                {dayEvents.length}
              </span>
            )}
          </div>

          <div className="space-y-1 mt-1 flex-1 overflow-y-auto max-h-[75px] no-scrollbar">
            {dayEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => {
                  setReschedulingEvent(ev);
                  setRescheduleDate(ev.startIso.split('T')[0]);
                  setRescheduleTime(new Date(ev.startIso).toTimeString().substring(0, 5));
                }}
                className="p-1 rounded-md text-[10px] bg-[#EBF2EE] text-[#1E5246] border border-[#2F5C50]/25 truncate cursor-pointer hover:bg-[#D9EADB] flex items-center gap-1 shadow-2xs transition-all hover:scale-[1.02]"
                title={`${ev.title} (${new Date(ev.startIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
              >
                {ev.meetUrl && <Video className="w-2.5 h-2.5 shrink-0 text-[#2F5C50]" />}
                <span className="truncate font-medium">{ev.title}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-3xl border border-[#E3DCCF] overflow-hidden shadow-2xs bg-white">
        <div className="grid grid-cols-7 bg-[#EAE5D9]/50 border-b border-[#E3DCCF] text-center text-[11px] font-semibold text-[#77766D] py-2.5">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>
        <div className="grid grid-cols-7">{days}</div>
      </div>
    );
  };

  // Render Week Grid
  const renderWeekView = () => {
    const startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayEvents = calendarEvents.filter((e) => e.startIso.startsWith(dateStr) && e.status !== 'cancelled');
      const isToday = isClient && new Date().toISOString().startsWith(dateStr);

      days.push(
        <div key={dateStr} className="flex-1 bg-white border-r last:border-r-0 border-[#E3DCCF] min-h-[360px] p-2 flex flex-col">
          <div
            className={`text-center py-2 border-b border-[#E3DCCF] rounded-2xl mb-2 ${
              isToday ? 'bg-[#262720] text-white shadow-xs' : 'bg-[#FAF8F2] text-[#262720]'
            }`}
          >
            <div className={`text-[11px] font-medium ${isToday ? 'text-white/80' : 'text-[#77766D]'}`}>{d.toLocaleDateString([], { weekday: 'short' })}</div>
            <div className="text-base font-bold">{d.getDate()}</div>
          </div>

          <div className="space-y-2 flex-1">
            {dayEvents.map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded-xl bg-[#FAF8F2] border border-[#E3DCCF] hover:border-[#2F5C50] space-y-1.5 text-xs shadow-2xs transition-all hover-lift"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-[#2F5C50]">
                    {new Date(ev.startIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {ev.meetUrl && <Video className="w-3 h-3 text-[#2F5C50]" />}
                </div>
                <h4 className="font-semibold text-[#262720] text-xs line-clamp-1">{ev.title}</h4>
                {ev.meetUrl && isSafeUrl(ev.meetUrl) && (
                  <a
                    href={sanitizeUrl(ev.meetUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2F5C50] hover:underline"
                  >
                    <span>Join Meet</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            ))}

            {dayEvents.length === 0 && (
              <div className="h-full flex items-center justify-center text-[11px] text-[#77766D]/60">
                Free
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-3xl border border-[#E3DCCF] overflow-hidden shadow-2xs flex bg-white">
        {days}
      </div>
    );
  };

  // Render Day View
  const renderDayView = () => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    const dayEvents = calendarEvents.filter((e) => e.startIso.startsWith(dateStr) && e.status !== 'cancelled');

    return (
      <div className="bg-white rounded-2xl border border-[#E4E0D6] p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E0D6]">
          <div>
            <h3 className="font-bold text-base text-[#292A27]">
              {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h3>
            <p className="text-xs text-[#77766F]">{dayEvents.length} meetings scheduled</p>
          </div>

          <button
            onClick={() => {
              setFormDate(dateStr);
              setShowScheduleModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#376E60] hover:bg-[#2B574C] text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Event</span>
          </button>
        </div>

        <div className="divide-y divide-[#E4E0D6]/60">
          {dayEvents.map((ev) => (
            <div key={ev.id} className="py-3 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#376E60] bg-[#EBF2EE] px-2 py-0.5 rounded-full">
                    {new Date(ev.startIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {new Date(ev.endIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <h4 className="font-bold text-sm text-[#292A27]">{ev.title}</h4>
                </div>
                {ev.description && <p className="text-xs text-[#77766F]">{ev.description}</p>}
                {ev.attendees && ev.attendees.length > 0 && (
                  <p className="text-[11px] text-[#77766F]">
                    Attendees: <span className="text-[#252725] font-medium">{ev.attendees.join(', ')}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {ev.meetUrl && isSafeUrl(ev.meetUrl) && (
                  <a
                    href={sanitizeUrl(ev.meetUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#376E60] hover:bg-[#2B574C] text-white text-xs font-semibold shadow-2xs"
                  >
                    <Video className="w-3 h-3" />
                    <span>Join Meet</span>
                  </a>
                )}
                <button
                  onClick={() => {
                    setReschedulingEvent(ev);
                    setRescheduleDate(ev.startIso.split('T')[0]);
                    setRescheduleTime(new Date(ev.startIso).toTimeString().substring(0, 5));
                  }}
                  className="p-1.5 rounded-xl border border-[#E4E0D6] text-[#77766F] hover:bg-[#FBFAF6]"
                  title="Reschedule"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleExecuteCancel(ev.id)}
                  className="p-1.5 rounded-xl border border-[#E4E0D6] text-[#CC5537] hover:bg-[#FAF0EC]"
                  title="Cancel meeting"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {dayEvents.length === 0 && (
            <div className="py-12 text-center text-xs text-[#77766F]">
              No events scheduled for this day. Click "Add Event" to schedule a client meeting.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in-50">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#262720] tracking-tight">
            Google Calendar & Meet
          </h1>
          <p className="text-xs text-[#77766D] mt-1">
            Bi-directional synchronization, dynamic Google Meet links, and client scheduling
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* OAuth Status Indicator */}
          {oauthStatus.connected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EBF2EE] border border-[#2F5C50]/20 text-[#2F5C50] text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{oauthStatus.email ? `Connected: ${oauthStatus.email}` : 'Google Calendar Connected'}</span>
              <button
                onClick={handleSyncNow}
                disabled={isSyncing}
                title="Sync now"
                className="button-press p-1 rounded-full hover:bg-[#D9EADB] transition-all ml-1"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleDisconnectGoogle}
                title="Disconnect account"
                className="button-press p-1 rounded-full hover:bg-rose-100 text-[#C8431F] transition-all"
              >
                <Unplug className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogle}
              className="button-press flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EAE5D9]/60 text-[#262720] text-xs font-semibold shadow-2xs transition-all"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-[#2F5C50]" />
              <span>Connect Google Calendar</span>
            </button>
          )}

          <button
            onClick={() => setShowScheduleModal(true)}
            className="button-press flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2F5C50] hover:bg-[#1E5246] text-white text-xs font-semibold shadow-xs hover:scale-102 transition-all"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Disconnected Notice Banner if not yet authorized */}
      {!oauthStatus.connected && !oauthStatus.loading && (
        <div className="p-4 rounded-3xl bg-[#FCF7E6]/70 border border-[#F2C94C]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[#8C6D1F] shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-[#262720]">Google Calendar is operating in Sheets-only mode</h4>
              <p className="text-[11px] text-[#77766D] mt-0.5">
                Connect your Google account via OAuth 2.0 to auto-generate real Google Meet conference links and sync attendee invitations.
              </p>
            </div>
          </div>
          <button
            onClick={handleConnectGoogle}
            className="button-press px-4 py-1.5 rounded-full bg-[#262720] text-white text-xs font-semibold hover:bg-[#1A1B16] shrink-0 shadow-2xs"
          >
            Connect Account
          </button>
        </div>
      )}

      {/* View Switcher and Date Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#FAF8F2] p-3 rounded-2xl border border-[#E3DCCF] shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="button-press px-3 py-1.5 rounded-full bg-white border border-[#E3DCCF] text-xs font-semibold text-[#262720] hover:bg-[#EAE5D9]/60 transition-all"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="button-press p-1.5 rounded-full hover:bg-white text-[#77766D] hover:text-[#262720]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              className="button-press p-1.5 rounded-full hover:bg-white text-[#77766D] hover:text-[#262720]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="font-bold text-sm text-[#262720] ml-2">
            {selectedDate.toLocaleDateString([], {
              month: 'long',
              year: 'numeric',
              day: viewMode === 'day' ? 'numeric' : undefined,
            })}
          </span>
        </div>

        {/* View Mode Pills */}
        <div className="flex items-center gap-1 bg-[#EAE5D9]/70 p-1 rounded-full border border-[#E3DCCF]">
          <button
            onClick={() => setViewMode('month')}
            className={`button-press px-3 py-1 rounded-full text-xs font-medium transition-all ${
              viewMode === 'month' ? 'bg-[#262720] text-white shadow-2xs' : 'text-[#77766D] hover:text-[#262720]'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`button-press px-3 py-1 rounded-full text-xs font-medium transition-all ${
              viewMode === 'week' ? 'bg-[#262720] text-white shadow-2xs' : 'text-[#77766D] hover:text-[#262720]'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('day')}
            className={`button-press px-3 py-1 rounded-full text-xs font-medium transition-all ${
              viewMode === 'day' ? 'bg-[#262720] text-white shadow-2xs' : 'text-[#77766D] hover:text-[#262720]'
            }`}
          >
            Day
          </button>
        </div>
      </div>

      {/* Main Grid: Calendar Canvas (Left 2 cols) & Upcoming Meetings Agenda (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {viewMode === 'month' && renderMonthGrid()}
          {viewMode === 'week' && renderWeekView()}
          {viewMode === 'day' && renderDayView()}
        </div>

        {/* Sidebar: Upcoming / Past Meetings List */}
        <div className="bg-[#FAF8F2] rounded-3xl p-5 border border-[#E3DCCF] shadow-2xs space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-[#E3DCCF] pb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#2F5C50]" />
              <h3 className="font-bold text-sm text-[#262720]">Meetings Agenda</h3>
            </div>

            <div className="flex items-center gap-1 bg-[#EAE5D9]/70 p-0.5 rounded-full text-xs">
              <button
                onClick={() => setTabMode('upcoming')}
                className={`button-press px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                  tabMode === 'upcoming' ? 'bg-white text-[#262720] shadow-2xs' : 'text-[#77766D]'
                }`}
              >
                Upcoming ({upcomingMeetings.length})
              </button>
              <button
                onClick={() => setTabMode('past')}
                className={`button-press px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                  tabMode === 'past' ? 'bg-white text-[#262720] shadow-2xs' : 'text-[#77766D]'
                }`}
              >
                Past ({pastMeetings.length})
              </button>
            </div>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[580px] no-scrollbar">
            {displayedListMeetings.map((ev) => {
              const leadObj = leads.find((l) => l.id === ev.leadId);

              return (
                <div
                  key={ev.id}
                  className="p-3.5 rounded-2xl bg-white border border-[#E3DCCF] space-y-2.5 shadow-2xs hover:border-[#2F5C50]/50 transition-all hover-lift"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-xs text-[#262720]">{ev.title}</h4>
                      {leadObj && (
                        <p className="text-[11px] text-[#77766D] flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span>{leadObj.title} ({leadObj.company})</span>
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[#EBF2EE] text-[#2F5C50] border border-[#2F5C50]/20 shrink-0">
                      {new Date(ev.startIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-[#77766D]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#77766D]" />
                      <span>{new Date(ev.startIso).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    </span>
                    {ev.attendees && ev.attendees.length > 0 && (
                      <span className="flex items-center gap-1 truncate max-w-[150px]">
                        <Users className="w-3 h-3 text-[#77766D]" />
                        <span className="truncate">{ev.attendees[0]}</span>
                      </span>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#E4E0D6]/60">
                    {ev.meetUrl && isSafeUrl(ev.meetUrl) ? (
                      <a
                        href={sanitizeUrl(ev.meetUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#376E60] hover:underline"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join Google Meet</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-[#77766F]">No video link</span>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setReschedulingEvent(ev);
                          setRescheduleDate(ev.startIso.split('T')[0]);
                          setRescheduleTime(new Date(ev.startIso).toTimeString().substring(0, 5));
                        }}
                        className="p-1 rounded-md text-[#77766F] hover:bg-[#FBFAF6] hover:text-[#252725]"
                        title="Reschedule"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleExecuteCancel(ev.id)}
                        className="p-1 rounded-md text-[#CC5537] hover:bg-[#FAF0EC]"
                        title="Cancel meeting"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {displayedListMeetings.length === 0 && (
              <div className="py-12 text-center text-xs text-[#77766F]">
                {tabMode === 'upcoming'
                  ? 'No upcoming meetings scheduled. Click "Schedule Meeting" to create one.'
                  : 'No past meetings recorded.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#FBFAF6] rounded-3xl p-6 border border-[#E4E0D6] shadow-2xl max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#292A27]">Schedule Google Calendar Event</h2>
                <p className="text-xs text-[#77766F]">Generates a verified Google Meet conference link and invites attendees</p>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="text-[#77766F] hover:text-[#252725]">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMeeting} className="space-y-3.5 text-xs">
              {/* Associate Deal / Lead */}
              <div>
                <label className="font-semibold block mb-1">Associated Lead or Deal</label>
                <select
                  value={formLeadId}
                  onChange={(e) => handleSelectLeadInForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white"
                >
                  <option value="">-- No specific deal (General meeting) --</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} — {l.company} ({l.contactName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="font-semibold block mb-1">Meeting Title *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. 15-Minute Strategy & Demo Call"
                  className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white focus:outline-none focus:ring-1 focus:ring-[#252725]"
                />
              </div>

              {/* Date & Time Row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="font-semibold block mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white"
                  />
                </div>
                <div className="col-span-1">
                  <label className="font-semibold block mb-1">Time *</label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white"
                  />
                </div>
                <div className="col-span-1">
                  <label className="font-semibold block mb-1">Duration</label>
                  <select
                    value={formDurationMinutes}
                    onChange={(e) => setFormDurationMinutes(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                  </select>
                </div>
              </div>

              {/* Attendees */}
              <div>
                <label className="font-semibold block mb-1">Attendee Email Addresses (comma-separated)</label>
                <input
                  type="text"
                  value={formAttendees}
                  onChange={(e) => setFormAttendees(e.target.value)}
                  placeholder="client@company.com, rep@rapport.internal"
                  className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white"
                />
              </div>

              {/* Google Meet Toggle */}
              <div className="p-3 rounded-2xl bg-white border border-[#E4E0D6] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#376E60]" />
                  <div>
                    <span className="font-semibold text-xs text-[#252725] block">Generate Google Meet link</span>
                    <span className="text-[10px] text-[#77766F]">
                      Attaches unique Hangouts/Meet video conference to event
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formEnableMeet}
                  onChange={(e) => setFormEnableMeet(e.target.checked)}
                  className="w-4 h-4 accent-[#376E60] cursor-pointer"
                />
              </div>

              {/* Description */}
              <div>
                <label className="font-semibold block mb-1">Description & Agenda</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Review pricing structure, implementation timeline, and security questions."
                  className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E4E0D6]">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-full border border-[#E4E0D6] text-[#77766F] hover:bg-[#EAE6DC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-full bg-[#376E60] hover:bg-[#2B574C] text-white font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? 'Syncing to Google...' : 'Schedule & Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingEvent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#FBFAF6] rounded-3xl p-6 border border-[#E4E0D6] shadow-2xl max-w-md w-full space-y-4">
            <h2 className="text-base font-bold text-[#292A27]">Reschedule Meeting</h2>
            <p className="text-xs text-[#77766F]">
              Updating <strong className="text-[#252725]">{reschedulingEvent.title}</strong>
            </p>

            <form onSubmit={handleExecuteReschedule} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">New Date *</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">New Start Time *</label>
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E4E0D6] bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E4E0D6]">
                <button
                  type="button"
                  onClick={() => setReschedulingEvent(null)}
                  className="px-4 py-2 rounded-full border border-[#E4E0D6] text-[#77766F]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-full bg-[#252725] hover:bg-[#1E201E] text-white font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? 'Rescheduling...' : 'Update Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
