import supabase from './Supabase/supabase.js'
import { useEffect, useState } from 'react'

function getBadgeLabel(rankTier) {
    if (!rankTier) return '';

    if (rankTier.startsWith('TOP_')) {
        const num = parseInt(rankTier.replace('TOP_', ''), 10);
        if (num >= 1 && num <= 25) {
            return `🏆 [RANK ${num}]`;
        }
    }

    const TIER_LABELS = {
        'TOP_50':   '👑 [ELITE 50]',
        'TOP_75':   '🎖️ [EXPERT 75]',
        'TOP_100':  '🥇 [CHAMP 100]',
        'TOP_200':  '🥈 [MASTER 200]',
        'TOP_500':  '🥉 [WARRIOR 500]',
        'TOP_1000': '⚔️ [PRO 1000]',
        'PARTICIPANT': '♟️ [PLAYER]'
    };

    return TIER_LABELS[rankTier] || rankTier;
}

function filterDuplicateBadges(badgesArray) {
    if (!badgesArray) return [];
    return badgesArray.filter((badge, idx, self) => {
        if (badge.rank_tier === 'TOP_50') {
            const hatExaktenRang = self.some(b =>
                b.season_name === badge.season_name &&
                b.rank_tier.startsWith('TOP_') &&
                parseInt(b.rank_tier.replace('TOP_', ''), 10) <= 25
            );
            return !hatExaktenRang;
        }
        return true;
    });
}

const THEME_LABELS = {
    traditional: '📜 Klassischer Look',
    green:       '🟢 Green Theme',
    violet:      '🟣 Violet Theme',
};

    // Neues Theme hier ergänzen, z.B.:
    // wood: '📟 Matrix-Modus',


export default function Menu({ user, onSelect, theme, onToggleTheme }) {
    const [profile, setProfile] = useState(null)

    useEffect(() => {
        if (!user?.id) return;

        supabase
            .from('profiles')
            .select(`
                id,
                username,
                elo,
                badges (
                    season_name,
                    rank_tier
                )
            `)
            .eq('id', user.id)
            .maybeSingle()
            .then(({ data }) => setProfile(data))
    }, [user])

    async function handleLogout() {
        await supabase.auth.signOut()
        window.location.reload()
    }

    return (
        <div className="menu">
            <h1 className="title">♟ CHESS.EXE</h1>

            {profile && (
                <div className="profile-badge">
                    <div className="profile-meta">
                        <span className="profile-username">👤 {profile.username}</span>
                        <span className="profile-elo">⚡ Elo: {profile.elo}</span>
                    </div>

                    {profile.badges && profile.badges.length > 0 && (
                        <div className="profile-badges-wrapper">
                            {filterDuplicateBadges(profile.badges).slice(0, 3).map((badge, idx) => (
                                <span
                                    key={idx}
                                    className="profile-badge-item"
                                    title={badge.season_name}
                                >
                                    {getBadgeLabel(badge.rank_tier)}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="menu-buttons">
                <button className="menu-btn online" onClick={() => onSelect('online')}>
                    🌐 Play Online
                    <span className="menu-btn-sub">Ranked • Gain/Lose Elo</span>
                </button>

                <button className="menu-btn" onClick={() => onSelect('local')}>
                    👥 2 Players
                    <span className="menu-btn-sub">Same device</span>
                </button>

                <button className="menu-btn" onClick={() => onSelect('bot')}>
                    👤 vs Bot
                    <span className="menu-btn-sub">Play against the AI</span>
                </button>

                <button className="menu-btn" onClick={() => onSelect('botvsbot')}>
                    🤖 Bot vs Bot
                    <span className="menu-btn-sub">Watch the AI play itself</span>
                </button>

                <button className="menu-btn" onClick={() => onSelect('leaderboard')}>
                    🏆 Leaderboard
                    <span className="menu-btn-sub">Top players by Elo</span>
                </button>

                <button className="menu-btn theme-toggle-btn" onClick={onToggleTheme}>
                    {THEME_LABELS[theme] || '🎨 Design wechseln'}
                    <span className="menu-btn-sub">Design wechseln</span>
                </button>
            </div>

            <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
    )
}