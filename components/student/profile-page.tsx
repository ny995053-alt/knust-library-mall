"use client";

import Link from "next/link";
import {
  LuArrowRight,
  LuBadgeCheck,
  LuBookOpen,
  LuCalendarDays,
  LuCamera,
  LuGraduationCap,
  LuIdCard,
  LuMail,
  LuMapPin,
  LuPhone,
  LuShieldCheck,
  LuClock3,
  LuUserRound,
  LuUsersRound,
} from "react-icons/lu";
import { useLibrary } from "@/components/student/library-provider";
import { initials } from "@/lib/utils";

function Detail({ label, value, icon: Icon }: { label: string; value?: string | number; icon: typeof LuMail }) {
  return <div className="profile-detail"><span><Icon /></span><p><small>{label}</small><strong>{value || "Not provided"}</strong></p></div>;
}

export function ProfilePage() {
  const { profile, loans, borrowRequests } = useLibrary();
  const pending = borrowRequests.filter((request) => request.status === "pending").length;
  const active = loans.filter((loan) => loan.status !== "returned").length;
  const completedChecks = [profile.studentRecordVerified, profile.studentIdVerified, profile.faceCheckVerified].filter(Boolean).length;
  const verificationComplete = completedChecks === 3;

  return (
    <div className="student-profile-page page-stack">
      <div className="page-heading-row">
        <div><span className="page-kicker">STUDENT RECORD</span><h1>Your profile</h1><p>Your academic, contact, recovery, and identity-check details in one place.</p></div>
        <Link href="/library" className="button button--primary">Explore books <LuArrowRight /></Link>
      </div>

      <section className="profile-identity-card">
        <span className="profile-identity-card__avatar">{initials(profile.fullName)}</span>
        <div><span className="section-kicker">LIBRARY IDENTITY</span><h2>{profile.fullName}</h2><p>{profile.studentEmail || profile.email}</p><div><span><LuIdCard /> {profile.indexNumber}</span><span><LuBookOpen /> {active} active loans</span><span><LuCalendarDays /> {pending} pending requests</span></div></div>
        <span className={"profile-identity-card__verified " + (verificationComplete ? "is-complete" : "is-pending")}>
          {verificationComplete ? <LuBadgeCheck /> : <LuClock3 />}
          {verificationComplete ? "All identity checks complete" : completedChecks + " of 3 identity checks complete"}
        </span>
      </section>

      <div className="profile-content-grid">
        <section className="profile-section-card">
          <div className="profile-section-card__heading"><span><LuGraduationCap /></span><div><small>ACADEMIC RECORD</small><h2>Programme details</h2></div></div>
          <div className="profile-details-grid">
            <Detail icon={LuGraduationCap} label="Department" value={profile.department} />
            <Detail icon={LuBookOpen} label="Programme" value={profile.programme} />
            <Detail icon={LuCalendarDays} label="Year started" value={profile.yearStarted} />
            <Detail icon={LuCalendarDays} label="Expected completion" value={profile.yearCompletion} />
          </div>
        </section>

        <section className="profile-section-card">
          <div className="profile-section-card__heading"><span><LuUserRound /></span><div><small>CONTACT & RESIDENCE</small><h2>Personal details</h2></div></div>
          <div className="profile-details-grid">
            <Detail icon={LuMail} label="Personal email" value={profile.personalEmail} />
            <Detail icon={LuPhone} label="Phone number" value={profile.phone} />
            <Detail icon={LuUserRound} label="Gender" value={profile.gender} />
            <Detail icon={LuMapPin} label="Residence type" value={profile.residenceType === "on-campus" ? "On campus" : profile.residenceType === "off-campus" ? "Off campus" : undefined} />
            <Detail icon={LuMapPin} label="Residence location" value={profile.residenceLocation} />
          </div>
        </section>

        <section className="profile-section-card">
          <div className="profile-section-card__heading"><span><LuUsersRound /></span><div><small>RECOVERY CONTACT</small><h2>Guardian details</h2></div></div>
          <div className="profile-details-grid">
            <Detail icon={LuUserRound} label="Guardian name" value={profile.guardianName} />
            <Detail icon={LuPhone} label="Guardian phone" value={profile.guardianPhone} />
            <Detail icon={LuUsersRound} label="Relationship" value={profile.guardianRelationship} />
          </div>
          <p className="profile-private-note"><LuShieldCheck /> Guardian details are visible only to you and authorized administrators. Librarians do not receive this information.</p>
        </section>

        <section className="profile-section-card profile-verification-card">
          <div className="profile-section-card__heading"><span><LuShieldCheck /></span><div><small>IDENTITY ASSURANCE</small><h2>Verification status</h2></div></div>
          <div className="verification-status-list">
            <div className={profile.studentRecordVerified ? "is-complete" : ""}><span><LuBadgeCheck /></span><p><strong>Student email & record</strong><small>{profile.studentRecordVerified ? "Student record check completed" : "Awaiting student record check"}</small></p></div>
            <div className={profile.studentIdVerified ? "is-complete" : ""}><span><LuIdCard /></span><p><strong>Student ID front</strong><small>{profile.studentIdVerified ? "Securely received and approved" : "ID document verification pending"}</small></p></div>
            <div className={profile.faceCheckVerified ? "is-complete" : ""}><span><LuCamera /></span><p><strong>Face presence check</strong><small>{profile.faceCheckVerified ? "Simulated presence check completed" : "Simulated presence check pending"}</small></p></div>
          </div>
          <p className="profile-private-note"><LuShieldCheck /> The camera check is a clearly marked simulation. One private face-presence image is retained for administrator-only review; no biometric match or template is created.</p>
        </section>
      </div>
    </div>
  );
}
