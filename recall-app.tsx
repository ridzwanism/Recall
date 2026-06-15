import { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Mic, MicOff, Moon, Sun, Download, X, MapPin,
  Building2, Users, Sparkles, Trash2, Edit2, ChevronDown, ChevronUp, User
} from 'lucide-react';

const AVATAR_GRADIENTS = [
  'from-purple-500 to-pink-500',
  'from-blue-500 to-cyan-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-red-500',
  'from-indigo-500 to-purple-500',
  'from-fuchsia-500 to-pink-500',
  'from-cyan-500 to-blue-500',
];

function getAvatarGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

const emptyForm = {
  name: '', location: '', company: '', connection: '', notes: '',
  physicalFeatures: [], character: []
};

export default function RecallApp() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ location: [], physical: [], character: [], company: [], connection: [] });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processingVoice, setProcessingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceLang, setVoiceLang] = useState('en-US');
  const recognitionRef = useRef(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  const theme = isDark ? {
    bg: 'bg-slate-950',
    cardBg: 'bg-slate-900',
    text: 'text-slate-100',
    textMuted: 'text-slate-400',
    border: 'border-slate-800',
    input: 'bg-slate-900 border-slate-800 text-slate-100 placeholder-slate-500',
    tagBg: 'bg-slate-800 text-slate-300',
    voiceBg: 'bg-slate-800',
    headerBg: 'bg-slate-950',
  } : {
    bg: 'bg-gray-50',
    cardBg: 'bg-white',
    text: 'text-gray-900',
    textMuted: 'text-gray-500',
    border: 'border-gray-200',
    input: 'bg-white border-gray-200 text-gray-900 placeholder-gray-400',
    tagBg: 'bg-gray-100 text-gray-600',
    voiceBg: 'bg-purple-50',
    headerBg: 'bg-gray-50',
  };

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get('recall-people', false);
        if (result && result.value) {
          setPeople(JSON.parse(result.value));
        }
      } catch (e) {
        // no data yet, start fresh
      }
      try {
        const themeResult = await window.storage.get('recall-theme', false);
        if (themeResult && themeResult.value) {
          setIsDark(themeResult.value === 'dark');
        }
      } catch (e) {
        // default light
      }
      setLoading(false);
    })();
  }, []);

  // Save people
  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        await window.storage.set('recall-people', JSON.stringify(people), false);
      } catch (e) {
        console.error('Save failed', e);
      }
    })();
  }, [people, loading]);

  // Save theme preference
  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        await window.storage.set('recall-theme', isDark ? 'dark' : 'light', false);
      } catch (e) {
        console.error('Theme save failed', e);
      }
    })();
  }, [isDark, loading]);

  // Set up speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        finalTranscript += event.results[i][0].transcript + ' ';
      }
      setTranscript(finalTranscript.trim());
    };
    recognition.onerror = (event) => {
      setVoiceError('Voice error: ' + event.error + '. You can type details manually.');
      setRecording(false);
    };
    recognition.onend = () => {
      setRecording(false);
    };
    recognitionRef.current = recognition;
  }, []);

  function startRecording() {
    if (!recognitionRef.current) {
      setVoiceError('Voice input is not supported on this browser.');
      return;
    }
    setTranscript('');
    setVoiceError('');
    recognitionRef.current.lang = voiceLang;
    try {
      recognitionRef.current.start();
      setRecording(true);
    } catch (e) {
      setVoiceError('Could not start microphone. Try again.');
    }
  }

  function stopRecording() {
    try { recognitionRef.current?.stop(); } catch (e) {}
    setRecording(false);
  }

  async function processTranscript() {
    if (!transcript.trim()) return;
    setProcessingVoice(true);
    setVoiceError('');
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Extract structured information about a person from this spoken note (it may be in English, Malay, or a mix). Return ONLY raw JSON with no markdown fences, no preamble, no explanation, with exactly these keys: name (string), location (string, e.g. neighborhood/venue/event), company (string, employer or organization), connection (string, e.g. "friend of Ahmad" or "met through work"), notes (string, any extra context not captured in other fields), physicalFeatures (array of short tags, 1-3 words each, e.g. "tall", "glasses", "beard"), character (array of short tags, 1-3 words each, e.g. "funny", "ambitious", "soft-spoken"). Use "" or [] for anything not mentioned. Keep all output in the same language as the input where reasonable. Spoken note: "${transcript}"`
          }]
        })
      });
      const data = await response.json();
      const textBlock = data.content.find(b => b.type === 'text');
      let raw = textBlock ? textBlock.text : '{}';
      raw = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(raw);
      setForm(prev => ({
        name: prev.name || parsed.name || '',
        location: prev.location || parsed.location || '',
        company: prev.company || parsed.company || '',
        connection: prev.connection || parsed.connection || '',
        notes: [prev.notes, parsed.notes].filter(Boolean).join(' ').trim(),
        physicalFeatures: [...new Set([...prev.physicalFeatures, ...(Array.isArray(parsed.physicalFeatures) ? parsed.physicalFeatures : [])])],
        character: [...new Set([...prev.character, ...(Array.isArray(parsed.character) ? parsed.character : [])])]
      }));
    } catch (e) {
      setVoiceError('Could not auto-fill fields — adding your note to the Notes field instead.');
      setForm(prev => ({ ...prev, notes: [prev.notes, transcript].filter(Boolean).join(' ').trim() }));
    } finally {
      setProcessingVoice(false);
    }
  }

  function toggleFilter(category, value) {
    setFilters(prev => {
      const current = prev[category];
      return {
        ...prev,
        [category]: current.includes(value) ? current.filter(v => v !== value) : [...current, value]
      };
    });
  }

  function clearFilters() {
    setFilters({ location: [], physical: [], character: [], company: [], connection: [] });
  }

  function savePerson() {
    if (!form.name.trim()) return;
    if (editingPerson) {
      setPeople(prev => prev.map(p => p.id === editingPerson.id ? { ...p, ...form } : p));
    } else {
      const newPerson = { id: Date.now().toString(), ...form, dateAdded: Date.now() };
      setPeople(prev => [newPerson, ...prev]);
    }
    closeModal();
  }

  function deletePerson(id) {
    setPeople(prev => prev.filter(p => p.id !== id));
    setSelectedPerson(null);
  }

  function closeModal() {
    setShowAddModal(false);
    setEditingPerson(null);
    setForm(emptyForm);
    setTranscript('');
    setVoiceError('');
    if (recording) stopRecording();
  }

  function openEdit(person) {
    setForm({
      name: person.name || '',
      location: person.location || '',
      company: person.company || '',
      connection: person.connection || '',
      notes: person.notes || '',
      physicalFeatures: person.physicalFeatures || [],
      character: person.character || []
    });
    setEditingPerson(person);
    setSelectedPerson(null);
    setShowAddModal(true);
  }

  function exportData() {
    const dataStr = JSON.stringify(people, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recall-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const allLocations = [...new Set(people.map(p => p.location).filter(Boolean))];
  const allCompanies = [...new Set(people.map(p => p.company).filter(Boolean))];
  const allConnections = [...new Set(people.map(p => p.connection).filter(Boolean))];
  const allPhysical = [...new Set(people.flatMap(p => p.physicalFeatures || []))];
  const allCharacter = [...new Set(people.flatMap(p => p.character || []))];

  const activeFilterCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0);

  const filteredPeople = people.filter(p => {
    if (search) {
      const haystack = `${p.name} ${p.notes} ${p.location} ${p.company} ${p.connection}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    if (filters.location.length && !filters.location.includes(p.location)) return false;
    if (filters.company.length && !filters.company.includes(p.company)) return false;
    if (filters.connection.length && !filters.connection.includes(p.connection)) return false;
    if (filters.physical.length && !filters.physical.some(f => (p.physicalFeatures || []).includes(f))) return false;
    if (filters.character.length && !filters.character.some(f => (p.character || []).includes(f))) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} transition-colors duration-300`}>
      <div className="max-w-2xl mx-auto pb-24">

        {/* Header */}
        <div className={`sticky top-0 z-20 ${theme.headerBg} border-b ${theme.border}`}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">Recall</h1>
                <p className={`text-xs ${theme.textMuted}`}>{people.length} {people.length === 1 ? 'person' : 'people'} remembered</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={exportData} title="Export data" className={`p-2 rounded-xl ${theme.tagBg} hover:opacity-80 transition-opacity`}>
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => setIsDark(!isDark)} title="Toggle theme" className={`p-2 rounded-xl ${theme.tagBg} hover:opacity-80 transition-opacity`}>
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 px-4 py-3">
          <StatCard icon={<Users className="w-4 h-4" />} label="People" value={people.length} gradient="from-purple-500 to-indigo-500" theme={theme} />
          <StatCard icon={<MapPin className="w-4 h-4" />} label="Places" value={allLocations.length} gradient="from-pink-500 to-rose-500" theme={theme} />
          <StatCard icon={<Building2 className="w-4 h-4" />} label="Companies" value={allCompanies.length} gradient="from-cyan-500 to-blue-500" theme={theme} />
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 border ${theme.input}`}>
            <Search className={`w-4 h-4 ${theme.textMuted} flex-shrink-0`} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, place, notes..."
              className="flex-1 bg-transparent outline-none text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 pb-2">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className={`flex items-center justify-between w-full rounded-2xl px-3 py-2.5 border ${theme.input} text-sm font-medium`}
          >
            <span className="flex items-center gap-2">
              Filters
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs min-w-[20px] text-center">
                  {activeFilterCount}
                </span>
              )}
            </span>
            {filtersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {filtersExpanded && (
            <div className={`mt-2 p-3 rounded-2xl border ${theme.border} ${theme.cardBg} space-y-3`}>
              <FilterGroup title="Location" icon={<MapPin className="w-3.5 h-3.5" />} options={allLocations} selected={filters.location} onToggle={v => toggleFilter('location', v)} theme={theme} />
              <FilterGroup title="Physical Features" icon={<User className="w-3.5 h-3.5" />} options={allPhysical} selected={filters.physical} onToggle={v => toggleFilter('physical', v)} theme={theme} />
              <FilterGroup title="Character" icon={<Sparkles className="w-3.5 h-3.5" />} options={allCharacter} selected={filters.character} onToggle={v => toggleFilter('character', v)} theme={theme} />
              <FilterGroup title="Company" icon={<Building2 className="w-3.5 h-3.5" />} options={allCompanies} selected={filters.company} onToggle={v => toggleFilter('company', v)} theme={theme} />
              <FilterGroup title="Connection" icon={<Users className="w-3.5 h-3.5" />} options={allConnections} selected={filters.connection} onToggle={v => toggleFilter('connection', v)} theme={theme} />
              {allLocations.length + allPhysical.length + allCharacter.length + allCompanies.length + allConnections.length === 0 && (
                <p className={`text-xs ${theme.textMuted}`}>Add a few people and filters will appear here automatically.</p>
              )}
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs font-semibold text-pink-500">Clear all filters</button>
              )}
            </div>
          )}
        </div>

        {/* People grid */}
        <div className="px-4 pt-2">
          {filteredPeople.length === 0 ? (
            <EmptyState noneAtAll={people.length === 0} theme={theme} onAdd={() => setShowAddModal(true)} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredPeople.map(person => (
                <PersonCard key={person.id} person={person} theme={theme} onClick={() => setSelectedPerson(person)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 shadow-xl flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform z-30"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={closeModal}></div>
          <div className={`relative w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto ${theme.cardBg} ${theme.text} p-4 pb-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">{editingPerson ? 'Edit Person' : 'Add Person'}</h2>
              <button onClick={closeModal} className={`p-1.5 rounded-full ${theme.tagBg}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Voice capture */}
            <div className={`rounded-2xl p-4 mb-4 border ${theme.border} ${theme.voiceBg}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Mic className="w-4 h-4" />
                  Voice Capture
                </span>
                {speechSupported && (
                  <div className="flex gap-1">
                    <button onClick={() => setVoiceLang('en-US')} className={`text-xs px-2 py-0.5 rounded-full ${voiceLang === 'en-US' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : theme.tagBg}`}>EN</button>
                    <button onClick={() => setVoiceLang('ms-MY')} className={`text-xs px-2 py-0.5 rounded-full ${voiceLang === 'ms-MY' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : theme.tagBg}`}>BM</button>
                  </div>
                )}
              </div>

              {speechSupported ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={recording ? stopRecording : startRecording}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all ${recording ? 'bg-red-500 animate-pulse scale-105' : 'bg-gradient-to-br from-purple-600 to-pink-600'}`}
                  >
                    {recording ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                  </button>
                  <p className={`text-xs ${theme.textMuted} text-center`}>
                    {recording ? 'Listening... tap to stop' : 'Tap and describe this person out loud'}
                  </p>
                  {transcript && (
                    <div className={`w-full rounded-xl p-2.5 text-sm ${theme.tagBg}`}>
                      "{transcript}"
                    </div>
                  )}
                  {transcript && !recording && (
                    <button
                      onClick={processTranscript}
                      disabled={processingVoice}
                      className="text-sm font-medium px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {processingVoice ? 'Filling in details...' : (<><Sparkles className="w-3.5 h-3.5" /> Auto-fill fields</>)}
                    </button>
                  )}
                  {voiceError && <p className="text-xs text-red-500 text-center">{voiceError}</p>}
                </div>
              ) : (
                <p className={`text-xs ${theme.textMuted} text-center`}>Voice input isn't supported in this browser. Try Chrome on Android, or fill in the fields below manually.</p>
              )}
            </div>

            {/* Form fields */}
            <div className="space-y-3">
              <FormField label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Sarah Tan" theme={theme} />
              <FormField label="Location" icon={<MapPin className="w-3.5 h-3.5" />} value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} placeholder="e.g. KL - Pavilion Mall" theme={theme} />
              <FormField label="Company / Organization" icon={<Building2 className="w-3.5 h-3.5" />} value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="e.g. Maybank" theme={theme} />
              <FormField label="Connection" icon={<Users className="w-3.5 h-3.5" />} value={form.connection} onChange={v => setForm(f => ({ ...f, connection: v }))} placeholder="e.g. Friend of Ahmad" theme={theme} />
              <TagInput label="Physical Features" icon={<User className="w-3.5 h-3.5" />} tags={form.physicalFeatures} onChange={tags => setForm(f => ({ ...f, physicalFeatures: tags }))} theme={theme} placeholder="Add & press enter" />
              <TagInput label="Character" icon={<Sparkles className="w-3.5 h-3.5" />} tags={form.character} onChange={tags => setForm(f => ({ ...f, character: tags }))} theme={theme} placeholder="Add & press enter" />
              <div>
                <label className={`text-sm font-medium ${theme.textMuted} mb-1.5 block`}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className={`w-full rounded-xl border p-2.5 text-sm outline-none ${theme.input}`}
                  placeholder="Anything else worth remembering..."
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={closeModal} className={`flex-1 py-2.5 rounded-xl font-medium border ${theme.border}`}>
                Cancel
              </button>
              <button
                onClick={savePerson}
                disabled={!form.name.trim()}
                className="flex-1 py-2.5 rounded-xl font-medium bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedPerson && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setSelectedPerson(null)}></div>
          <div className={`relative w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto ${theme.cardBg} ${theme.text} p-4 pb-6`}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelectedPerson(null)} className={`p-1.5 rounded-full ${theme.tagBg}`}>
                <X className="w-4 h-4" />
              </button>
              <div className="flex gap-2">
                <button onClick={() => openEdit(selectedPerson)} className={`p-1.5 rounded-full ${theme.tagBg}`}>
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => deletePerson(selectedPerson.id)} className="p-1.5 rounded-full bg-red-100 text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center text-center mb-4">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedPerson.name)} flex items-center justify-center text-white font-bold text-2xl mb-3`}>
                {getInitials(selectedPerson.name)}
              </div>
              <h2 className="font-bold text-xl">{selectedPerson.name}</h2>
              {selectedPerson.location && (
                <p className={`text-sm ${theme.textMuted} flex items-center gap-1 mt-1`}>
                  <MapPin className="w-3.5 h-3.5" /> {selectedPerson.location}
                </p>
              )}
            </div>

            <div className="space-y-3">
              {selectedPerson.company && <DetailRow icon={<Building2 className="w-4 h-4" />} label="Company" value={selectedPerson.company} theme={theme} />}
              {selectedPerson.connection && <DetailRow icon={<Users className="w-4 h-4" />} label="Connection" value={selectedPerson.connection} theme={theme} />}
              {selectedPerson.physicalFeatures?.length > 0 && <TagDisplayRow icon={<User className="w-4 h-4" />} label="Physical Features" tags={selectedPerson.physicalFeatures} theme={theme} />}
              {selectedPerson.character?.length > 0 && <TagDisplayRow icon={<Sparkles className="w-4 h-4" />} label="Character" tags={selectedPerson.character} theme={theme} />}
              {selectedPerson.notes && (
                <div>
                  <div className={`text-xs font-medium ${theme.textMuted} mb-1`}>Notes</div>
                  <p className="text-sm leading-relaxed">{selectedPerson.notes}</p>
                </div>
              )}
              <div className={`text-xs ${theme.textMuted} pt-2 border-t ${theme.border}`}>
                Added {new Date(selectedPerson.dateAdded).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, gradient, theme }) {
  return (
    <div className={`rounded-2xl p-3 ${theme.cardBg} border ${theme.border}`}>
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white mb-2`}>
        {icon}
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className={`text-xs ${theme.textMuted}`}>{label}</div>
    </div>
  );
}

function FilterGroup({ title, icon, options, selected, onToggle, theme }) {
  if (options.length === 0) return null;
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${theme.textMuted} mb-1.5`}>
        {icon}{title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent' : `${theme.cardBg} ${theme.border} ${theme.text}`}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PersonCard({ person, theme, onClick }) {
  const gradient = getAvatarGradient(person.name);
  const tags = [...(person.physicalFeatures || []), ...(person.character || [])].slice(0, 2);
  return (
    <button onClick={onClick} className={`text-left rounded-2xl p-3 border ${theme.border} ${theme.cardBg} hover:scale-[1.02] active:scale-[0.98] transition-transform`}>
      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm mb-2`}>
        {getInitials(person.name)}
      </div>
      <div className="font-semibold text-sm truncate">{person.name}</div>
      {person.location && (
        <div className={`text-xs ${theme.textMuted} flex items-center gap-1 mt-0.5 truncate`}>
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{person.location}</span>
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map(t => (
            <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full ${theme.tagBg} truncate max-w-full`}>{t}</span>
          ))}
        </div>
      )}
    </button>
  );
}

function FormField({ label, icon, value, onChange, placeholder, theme }) {
  return (
    <div>
      <label className={`text-sm font-medium ${theme.textMuted} flex items-center gap-1.5 mb-1.5`}>
        {icon}{label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border p-2.5 text-sm outline-none ${theme.input}`}
      />
    </div>
  );
}

function TagInput({ label, icon, tags, onChange, theme, placeholder }) {
  const [input, setInput] = useState('');

  function addTag() {
    const val = input.trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
    }
    setInput('');
  }

  function removeTag(tag) {
    onChange(tags.filter(t => t !== tag));
  }

  return (
    <div>
      <label className={`text-sm font-medium ${theme.textMuted} flex items-center gap-1.5 mb-1.5`}>
        {icon}{label}
      </label>
      <div className={`flex flex-wrap gap-1.5 p-2 rounded-xl border ${theme.input}`}>
        {tags.map(tag => (
          <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white">
            {tag}
            <button onClick={() => removeTag(tag)}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
          onBlur={addTag}
          placeholder={placeholder}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-1"
        />
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, theme }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`mt-0.5 ${theme.textMuted}`}>{icon}</div>
      <div>
        <div className={`text-xs font-medium ${theme.textMuted}`}>{label}</div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}

function TagDisplayRow({ icon, label, tags, theme }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`mt-0.5 ${theme.textMuted}`}>{icon}</div>
      <div className="flex-1">
        <div className={`text-xs font-medium ${theme.textMuted} mb-1`}>{label}</div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => (
            <span key={t} className={`text-xs px-2 py-0.5 rounded-full ${theme.tagBg}`}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ noneAtAll, theme, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-white" />
      </div>
      <h3 className="font-semibold mb-1">{noneAtAll ? 'No one yet' : 'No matches found'}</h3>
      <p className={`text-sm ${theme.textMuted} mb-4 max-w-xs`}>
        {noneAtAll ? 'Start building your personal directory — add the first person you remember, by hand or by voice.' : 'Try adjusting your search or filters.'}
      </p>
      {noneAtAll && (
        <button onClick={onAdd} className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium">
          Add your first person
        </button>
      )}
    </div>
  );
}