import React, { useEffect, useState } from 'react';
import { resolveBackgroundAssets } from '@/src/lib/backgroundAssets';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { LanguageProvider } from '@/src/context/LanguageContext';
import { SocialProvider } from '@/src/context/SocialContext';
import { ThemeProvider } from '@/src/context/ThemeContext';
import { ToastProvider } from '@/src/context/ToastContext';
import { AppShell } from '@/src/components/AppShell';
import { LoadingScreen } from '@/src/components/LoadingScreen';
import { ProtectedRoute } from '@/src/components/ProtectedRoute';
import { AdminDashboardPage } from '@/src/pages/AdminDashboardPage';
import { AnnouncementsPage } from '@/src/pages/AnnouncementsPage';
import { AttendancePage } from '@/src/pages/AttendancePage';
import { AuthPage } from '@/src/pages/AuthPage';
import { BiblePage } from '@/src/pages/BiblePage';
import { ChatPage } from '@/src/pages/ChatPage';
import { CommunityPage } from '@/src/pages/CommunityPage';
import { DataImportPage } from '@/src/pages/DataImportPage';
import { DirectoryPage } from '@/src/pages/DirectoryPage';
import { EventsPage } from '@/src/pages/EventsPage';
import { GalleryPage } from '@/src/pages/GalleryPage';
import { HomePage } from '@/src/pages/HomePage';
import { HymnalPage } from '@/src/pages/HymnalPage';
import { LeadersPage } from '@/src/pages/LeadersPage';
import { MorePage } from '@/src/pages/MorePage';
import { NotebookPage } from '@/src/pages/NotebookPage';
import { NotificationsPage } from '@/src/pages/NotificationsPage';
import { PrayerWallPage } from '@/src/pages/PrayerWallPage';
import { ProfilePage } from '@/src/pages/ProfilePage';
import { SabbathPage } from '@/src/pages/SabbathPage';
import { SettingsPage } from '@/src/pages/SettingsPage';
import { useRealtimeNotifications } from '@/src/hooks/useRealtimeNotifications';
import { type AppRoute } from '@/src/types/database';

const AppRouter: React.FC = () => {
  const { session, loading } = useAuth();
  const [route, setRoute] = useState<AppRoute>('home');
  const [pendingVerseRef, setPendingVerseRef] = useState<string | null>(null);
  const [bibleJump, setBibleJump] = useState<{ book: string; chapter: number } | null>(null);

  useRealtimeNotifications();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <AuthPage />;
  }

  const handleAddNoteForVerse = (verseRef: string) => {
    setPendingVerseRef(verseRef);
    setRoute('notebook');
  };

  const handleOpenBibleRef = (book: string, chapter: number) => {
    setBibleJump({ book, chapter });
    setRoute('bible');
  };

  return (
    <SocialProvider onNavigate={setRoute}>
      <AppShell currentRoute={route} onNavigate={setRoute}>
        {route === 'home' && (
          <HomePage
            onNavigate={setRoute}
            onAddNoteForVerse={handleAddNoteForVerse}
            onOpenBibleRef={handleOpenBibleRef}
          />
        )}
        {route === 'community' && <CommunityPage />}
        {route === 'notifications' && <NotificationsPage />}
        {route === 'leaders' && <LeadersPage />}
        {route === 'sabbath' && <SabbathPage onNavigate={setRoute} />}
        {route === 'directory' && <DirectoryPage />}
        {route === 'profile' && <ProfilePage onNavigate={setRoute} />}
        {route === 'announcements' && <AnnouncementsPage />}
        {route === 'events' && <EventsPage />}
        {route === 'attendance' && <AttendancePage />}
        {route === 'bible' && (
          <BiblePage
            initialBook={bibleJump?.book}
            initialChapter={bibleJump?.chapter}
            onAddNoteForVerse={handleAddNoteForVerse}
          />
        )}
        {route === 'hymnal' && <HymnalPage />}
        {route === 'notebook' && (
          <NotebookPage
            pendingVerseRef={pendingVerseRef}
            onClearPendingVerseRef={() => setPendingVerseRef(null)}
          />
        )}
        {route === 'chat' && <ChatPage />}
        {route === 'prayer' && <PrayerWallPage />}
        {route === 'gallery' && <GalleryPage />}
        {route === 'admin' && (
          <ProtectedRoute requireAdmin onFallback={() => setRoute('home')}>
            <AdminDashboardPage onNavigate={setRoute} />
          </ProtectedRoute>
        )}
        {route === 'data-import' && (
          <ProtectedRoute requireSuperAdmin onFallback={() => setRoute('home')}>
            <DataImportPage />
          </ProtectedRoute>
        )}
        {route === 'settings' && <SettingsPage />}
        {route === 'more' && <MorePage onNavigate={setRoute} />}
      </AppShell>
    </SocialProvider>
  );
};

export default function App() {
  useEffect(() => {
    resolveBackgroundAssets();
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
