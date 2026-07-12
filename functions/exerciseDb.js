// Master exercise database — edit only via admin tools
// curve: how well resistance curve matches muscle strength curve by insertion leverage
// matching = peak resistance aligns with peak muscle output
// partial  = some mismatch, acceptable trade-off
// opposing = peak resistance where muscle is weakest

const EXERCISE_DB = [

  // ── CHEST ────────────────────────────────────────────────────────────────────
  {
    id: 'barbell-bench-press',
    name: 'Barbell Bench Press',
    category: 'push', equipment: 'barbell',
    primary: ['chest', 'triceps', 'front-delt'], secondary: ['serratus'],
    curve: 'partial',
    curveNote: 'Chest leverage peaks mid-range; moment arm shortens near lockout where triceps take over. Gravity vector works against horizontal adduction at the top.',
    form: ['Retract and depress scapulae before unracking', 'Bar path slightly diagonal — touch lower chest', 'Maintain leg drive throughout', 'Elbows 45–75° from torso, not flared to 90°'],
    lesserKnown: false
  },
  {
    id: 'incline-barbell-bench-press',
    name: 'Incline Barbell Bench Press',
    category: 'push', equipment: 'barbell',
    primary: ['chest', 'front-delt', 'triceps'], secondary: ['serratus'],
    curve: 'partial',
    curveNote: 'Higher incline shifts load to front-delt; chest leverage partially maintained through mid-range. Upper fibres recruited more but resistance curve still suboptimal at top.',
    form: ['30–45° incline is optimal for upper chest emphasis', 'Bar touches upper chest, not collarbone', 'Keep scapulae pinched throughout', 'Avoid excessive arch — this is a chest exercise, not a hack'],
    lesserKnown: false
  },
  {
    id: 'decline-barbell-bench-press',
    name: 'Decline Barbell Bench Press',
    category: 'push', equipment: 'barbell',
    primary: ['chest', 'triceps'], secondary: ['front-delt', 'serratus'],
    curve: 'matching',
    curveNote: 'Decline shifts resistance vector to better match lower-chest horizontal adduction leverage throughout ROM. Tricep moment arm also improves at lockout vs flat.',
    form: ['Feet secured firmly on pad', 'Bar touches lower chest — natural decline arc', 'Keep elbows tucked slightly more than flat press', 'Full lockout at top — triceps complete the rep'],
    lesserKnown: false
  },
  {
    id: 'close-grip-bench-press',
    name: 'Close-Grip Bench Press',
    category: 'push', equipment: 'barbell',
    primary: ['triceps', 'chest'], secondary: ['front-delt'],
    curve: 'partial',
    curveNote: 'Narrows grip shifts lever arm so triceps are primary mover; chest involvement drops. Triceps work hard through mid-range but moment arm shortens at full extension.',
    form: ['Grip shoulder-width, not too narrow — wrists will suffer', 'Elbows stay close to torso throughout', 'Touch mid-chest, not sternum', 'Full lockout — triceps finish the rep'],
    lesserKnown: false
  },
  {
    id: 'dumbbell-flat-bench-press',
    name: 'Dumbbell Bench Press (Flat)',
    category: 'push', equipment: 'dumbbell',
    primary: ['chest', 'triceps', 'front-delt'], secondary: ['serratus'],
    curve: 'partial',
    curveNote: 'Greater ROM than barbell allows more horizontal adduction but resistance still drops near lockout. Unilateral loading corrects strength imbalances.',
    form: ['Lower to chest level — go deeper than barbell allows', 'Neutral or slight pronation at top', 'Control the eccentric — do not bounce off chest', 'Keep shoulder blades squeezed back throughout'],
    lesserKnown: false
  },
  {
    id: 'dumbbell-incline-bench-press',
    name: 'Dumbbell Incline Bench Press',
    category: 'push', equipment: 'dumbbell',
    primary: ['chest', 'front-delt', 'triceps'], secondary: ['serratus'],
    curve: 'partial',
    curveNote: 'Similar to incline barbell but extended ROM; upper chest fibres better recruited. Resistance still favours mid-range.',
    form: ['30–45° bench angle', 'Dumbbells travel in arc, not straight line', 'Slight wrist rotation at bottom for shoulder safety', 'Squeeze chest hard at top before lowering'],
    lesserKnown: false
  },
  {
    id: 'dumbbell-decline-bench-press',
    name: 'Dumbbell Decline Bench Press',
    category: 'push', equipment: 'dumbbell',
    primary: ['chest', 'triceps'], secondary: ['front-delt'],
    curve: 'matching',
    curveNote: 'Decline angle improves resistance curve alignment for lower chest fibres. Greater ROM than barbell version adds value at the bottom.',
    form: ['Secure feet before lowering dumbbells', 'Wide arc path mimics pec-deck motion', 'Full stretch at bottom within pain-free range', 'Squeeze hard at top'],
    lesserKnown: false
  },
  {
    id: 'cable-fly-high-to-low',
    name: 'Cable Fly (High to Low)',
    category: 'push', equipment: 'cable',
    primary: ['chest'], secondary: ['front-delt', 'serratus'],
    curve: 'matching',
    curveNote: 'High-pulley position means maximum resistance at the bottom of the arc where chest is contracting hardest. Consistent tension throughout entire ROM — superior to dumbbell fly.',
    form: ['Pulleys set above shoulder height', 'Slight forward lean to align force vector with chest fibres', 'Maintain soft elbow bend throughout', 'Hands meet below sternum — squeeze for 1 second'],
    lesserKnown: false
  },
  {
    id: 'cable-fly-low-to-high',
    name: 'Cable Fly (Low to High)',
    category: 'push', equipment: 'cable',
    primary: ['chest'], secondary: ['front-delt', 'serratus'],
    curve: 'matching',
    curveNote: 'Low-pulley targets upper chest fibres; resistance increases as arm rises, matching upper fibre recruitment pattern. Cable maintains tension throughout unlike dumbbells.',
    form: ['Pulleys set at ankle/hip height', 'Slight lean forward', 'Hands meet at eye level or above', 'Squeeze at top for peak upper chest contraction'],
    lesserKnown: false
  },
  {
    id: 'cable-crossover',
    name: 'Cable Crossover',
    category: 'push', equipment: 'cable',
    primary: ['chest'], secondary: ['front-delt', 'serratus'],
    curve: 'matching',
    curveNote: 'Cables provide consistent tension throughout the full arc, unlike free weights where resistance varies by joint angle. Peak resistance aligns with chest contraction at centre.',
    form: ['Arms cross in front — full horizontal adduction', 'Elbows fixed at slight bend — this is not a press', 'Control the eccentric fully', 'Lean slightly forward for chest alignment'],
    lesserKnown: false
  },
  {
    id: 'pec-deck',
    name: 'Pec Deck / Machine Fly',
    category: 'push', equipment: 'machine',
    primary: ['chest'], secondary: ['front-delt'],
    curve: 'matching',
    curveNote: 'Cam-based resistance profile on quality machines closely matches chest strength curve. Consistent resistance from stretch to peak contraction — excellent isolation.',
    form: ['Seat height so elbows align with shoulder', 'Do not let elbows drop below shoulder plane', 'Full ROM — control the return', 'Pause briefly at peak contraction'],
    lesserKnown: false
  },
  {
    id: 'chest-dips',
    name: 'Chest Dips',
    category: 'push', equipment: 'bodyweight',
    primary: ['chest', 'triceps'], secondary: ['front-delt'],
    curve: 'partial',
    curveNote: 'Lean forward shifts load to chest; triceps handle more load at lockout. Gravity provides best resistance in the bottom half — top half is largely unloaded for chest.',
    form: ['Lean torso 30° forward throughout', 'Wide grip bars if available', 'Go to 90° elbow bend minimum', 'Add weight via belt once bodyweight is easy'],
    lesserKnown: false
  },
  {
    id: 'push-up',
    name: 'Push-Up',
    category: 'push', equipment: 'bodyweight',
    primary: ['chest', 'triceps', 'front-delt'], secondary: ['serratus', 'core'],
    curve: 'partial',
    curveNote: 'Bodyweight provides maximum resistance at bottom (longest moment arm from shoulder to floor contact). Resistance drops near lockout. Full scapular protraction adds serratus benefit unavailable with barbell.',
    form: ['Full scapular protraction at top — push floor away', 'Body rigid as a plank', 'Chest touches floor or just above', 'Elbows at 45° not flared'],
    lesserKnown: false
  },
  {
    id: 'weighted-push-up',
    name: 'Weighted Push-Up',
    category: 'push', equipment: 'bodyweight',
    primary: ['chest', 'triceps', 'front-delt'], secondary: ['serratus', 'core'],
    curve: 'partial',
    curveNote: 'Same profile as push-up; plate on back scales load while preserving scapular freedom unavailable with barbell pressing.',
    form: ['Plate placed on upper back / traps', 'Have a partner load if heavy', 'Keep same form cues as standard push-up', 'Rings or handles increase ROM and difficulty'],
    lesserKnown: false
  },
  {
    id: 'machine-chest-press',
    name: 'Machine Chest Press',
    category: 'push', equipment: 'machine',
    primary: ['chest', 'triceps', 'front-delt'], secondary: ['serratus'],
    curve: 'partial',
    curveNote: 'Cam profile varies by manufacturer — hammer strength machines approach matching curve. Removes stabiliser demand allowing higher chest-specific load.',
    form: ['Adjust seat so handles align with mid-chest', 'Full ROM — do not short-stroke', 'Squeeze at full extension', 'Use pause at bottom for time under tension'],
    lesserKnown: false
  },
  {
    id: 'svend-press',
    name: 'Svend Press',
    category: 'push', equipment: 'bodyweight',
    primary: ['chest'], secondary: ['front-delt'],
    curve: 'matching',
    curveNote: 'Squeezing plates while pressing maintains constant adduction tension on chest throughout. Resistance from plate squeeze directly loads horizontal adduction — one of few exercises that does so.',
    form: ['Squeeze two plates firmly together throughout', 'Press outward from chest, arms stay parallel to floor', 'Slow and controlled — this is not heavy', 'Focus on chest squeeze, not weight moved'],
    lesserKnown: true
  },

  // ── BACK — VERTICAL PULL ─────────────────────────────────────────────────────
  {
    id: 'pull-up-wide',
    name: 'Pull-Up (Wide Grip)',
    category: 'pull', equipment: 'bodyweight',
    primary: ['lats'], secondary: ['biceps', 'rear-delt', 'rhomboids'],
    curve: 'partial',
    curveNote: 'Wide grip reduces bicep contribution; lat lever is strongest when humerus is at ~30° from vertical. Gravity provides maximum resistance mid-range — lighter at top and bottom of ROM.',
    form: ['Dead hang start — full lat stretch', 'Lead with chest, not chin', 'Elbows drive down and back', 'Full extension at bottom on every rep'],
    lesserKnown: false
  },
  {
    id: 'pull-up-neutral',
    name: 'Pull-Up (Neutral Grip)',
    category: 'pull', equipment: 'bodyweight',
    primary: ['lats', 'biceps'], secondary: ['rear-delt', 'rhomboids', 'brachialis'],
    curve: 'partial',
    curveNote: 'Neutral grip puts brachialis in optimal supination; combined lat/bicep recruitment provides most balanced loading. Typically allows most weight of pull-up variations.',
    form: ['Parallel handles shoulder-width', 'Full dead hang at bottom', 'Chest to bar at top', 'No kipping — pure strength'],
    lesserKnown: false
  },
  {
    id: 'chin-up',
    name: 'Chin-Up',
    category: 'pull', equipment: 'bodyweight',
    primary: ['lats', 'biceps'], secondary: ['rhomboids', 'rear-delt'],
    curve: 'partial',
    curveNote: 'Supinated grip maximises bicep supination strength — more total load possible, but shifts emphasis from lats. Biceps strongest around 90° elbow which coincides with mid-pull.',
    form: ['Supinated grip, shoulder-width', 'Full dead hang to start', 'Chin clears bar — not just nose', 'Keep core tight to avoid swing'],
    lesserKnown: false
  },
  {
    id: 'weighted-pull-up',
    name: 'Weighted Pull-Up',
    category: 'pull', equipment: 'bodyweight',
    primary: ['lats', 'biceps'], secondary: ['rear-delt', 'rhomboids'],
    curve: 'partial',
    curveNote: 'Adding load via belt maintains same mechanics as bodyweight pull-up but pushes intensity beyond bodyweight limit. Most effective strength builder in vertical pull category.',
    form: ['Weight belt or dumbbell between legs', 'Still achieve full dead hang and chest to bar', 'Do not sacrifice ROM for load', 'Neutral or overhand grip depending on goal'],
    lesserKnown: false
  },
  {
    id: 'lat-pulldown-wide',
    name: 'Lat Pulldown (Wide Grip)',
    category: 'pull', equipment: 'machine',
    primary: ['lats'], secondary: ['biceps', 'rear-delt', 'rhomboids'],
    curve: 'partial',
    curveNote: 'Cable maintains constant tension unlike bodyweight pull-ups. Wide grip reduces bicep contribution. Resistance consistent from top through mid-range; decreases as bar reaches chest.',
    form: ['Slight lean back, chest up', 'Pull bar to upper chest, not behind neck', 'Full stretch at top — do not short-ROM', 'Drive elbows down and back'],
    lesserKnown: false
  },
  {
    id: 'lat-pulldown-neutral',
    name: 'Lat Pulldown (Neutral Grip)',
    category: 'pull', equipment: 'machine',
    primary: ['lats', 'biceps'], secondary: ['rear-delt', 'rhomboids'],
    curve: 'partial',
    curveNote: 'Neutral/parallel grip allows strongest pull position for most users due to supination neutrality. Combined lat and bicep engagement.',
    form: ['V-bar or parallel handle attachment', 'Full arm extension at top', 'Pull to upper chest level', 'Lean back slightly — not excessively'],
    lesserKnown: false
  },
  {
    id: 'lat-pulldown-reverse',
    name: 'Lat Pulldown (Reverse / Underhand)',
    category: 'pull', equipment: 'machine',
    primary: ['lats', 'biceps'], secondary: ['rhomboids'],
    curve: 'partial',
    curveNote: 'Supinated grip mirrors chin-up mechanics; biceps contribute more which typically allows heavier loading. Lat recruitment still strong, especially lower portion.',
    form: ['Shoulder-width supinated grip', 'Elbows stay close to body throughout', 'Pull bar to upper chest', 'Squeeze lats hard at bottom of pull'],
    lesserKnown: false
  },
  {
    id: 'cable-straight-arm-pulldown',
    name: 'Cable Straight-Arm Pulldown',
    category: 'pull', equipment: 'cable',
    primary: ['lats'], secondary: ['teres-major', 'abs'],
    curve: 'matching',
    curveNote: 'Straight arm isolates lat from biceps entirely. Resistance from high pulley increases as arm sweeps down, closely matching lat activation pattern during shoulder extension.',
    form: ['Arms straight or very slight bend — locked position', 'Hinge forward from hips slightly', 'Sweep bar to hip level', 'Squeeze lats hard at bottom — hold briefly'],
    lesserKnown: false
  },
  {
    id: 'single-arm-pulldown',
    name: 'Single-Arm Lat Pulldown',
    category: 'pull', equipment: 'cable',
    primary: ['lats'], secondary: ['biceps', 'rear-delt'],
    curve: 'partial',
    curveNote: 'Unilateral loading corrects imbalances. Cable provides consistent tension; single arm allows greater ROM and rotation at bottom for full lat contraction.',
    form: ['Reach fully at top — get the lat stretch', 'Pull elbow down and back past hip', 'Slight lean away from the cable', 'Avoid rotating the torso excessively'],
    lesserKnown: false
  },
  {
    id: 'cable-pullover',
    name: 'Cable Pullover',
    category: 'pull', equipment: 'cable',
    primary: ['lats', 'chest'], secondary: ['teres-major', 'abs'],
    curve: 'matching',
    curveNote: 'High pulley cable maintains tension throughout the sweep from overhead to hip — superior to dumbbell pullover which loses resistance at the bottom. Lats and chest both contribute to shoulder extension.',
    form: ['Lie on flat bench perpendicular to cable', 'Slight bend in elbows, locked position', 'Full overhead stretch — do not limit ROM', 'Sweep to hip level, squeeze lats and chest'],
    lesserKnown: false
  },

  // ── BACK — HORIZONTAL PULL ───────────────────────────────────────────────────
  {
    id: 'barbell-row-overhand',
    name: 'Barbell Row (Overhand / Pendlay)',
    category: 'pull', equipment: 'barbell',
    primary: ['lats', 'rhomboids', 'mid-traps'], secondary: ['rear-delt', 'biceps', 'erectors'],
    curve: 'partial',
    curveNote: 'Pronated grip reduces bicep contribution; rhomboids and mid-traps take over at end range. Gravity vector loads well through mid-pull; slightly awkward at full retraction.',
    form: ['Bar starts from floor each rep for strict Pendlay', 'Torso 45–90° depending on style', 'Pull to lower chest / upper abdomen', 'Full dead hang between reps for Pendlay'],
    lesserKnown: false
  },
  {
    id: 'barbell-row-underhand',
    name: 'Barbell Row (Underhand / Yates)',
    category: 'pull', equipment: 'barbell',
    primary: ['lats', 'biceps'], secondary: ['rhomboids', 'rear-delt'],
    curve: 'partial',
    curveNote: 'Supinated grip maximises bicep involvement allowing heavier loads; lats strongly activated especially lower fibres. More upright torso than overhand style.',
    form: ['More upright torso than overhand — 70° or so', 'Pull to belly button area', 'Elbows stay close to sides', 'Control the descent — do not drop it'],
    lesserKnown: false
  },
  {
    id: 'meadows-row',
    name: 'Meadows Row',
    category: 'pull', equipment: 'barbell',
    primary: ['lats'], secondary: ['rear-delt', 'biceps', 'rhomboids'],
    curve: 'matching',
    curveNote: 'Landmine angle creates unique force vector that loads the lat through a longer arc than any other row. Elbow travels behind torso at peak contraction — full lat shortening.',
    form: ['Landmine in corner or holder', 'Stand perpendicular to bar, grip end of bar', 'Drive elbow up and back past torso', 'Allow shoulder to drop at bottom for full lat stretch'],
    lesserKnown: true
  },
  {
    id: 'dumbbell-row-three-point',
    name: 'Dumbbell Row (Three-Point)',
    category: 'pull', equipment: 'dumbbell',
    primary: ['lats'], secondary: ['rear-delt', 'biceps', 'rhomboids'],
    curve: 'partial',
    curveNote: 'Ipsilateral support position allows elbow to travel further behind torso than barbell rows — better lat peak contraction. Heavier loads possible than chest-supported versions.',
    form: ['Brace same-side hand and knee on bench', 'Let shoulder drop at bottom — stretch the lat', 'Pull elbow past hip, not just to hip', 'Do not rotate torso — resist the urge'],
    lesserKnown: false
  },
  {
    id: 'dumbbell-row-chest-supported',
    name: 'Chest-Supported Dumbbell Row',
    category: 'pull', equipment: 'dumbbell',
    primary: ['lats', 'rhomboids', 'mid-traps', 'rear-delt'], secondary: ['biceps'],
    curve: 'partial',
    curveNote: 'Chest support eliminates erector fatigue and momentum; forces honest mid-back work. Gravity vector is directly opposing the pull through full ROM.',
    form: ['Incline bench at 30–45°', 'Chest on pad throughout — do not lift off', 'Both arms simultaneously or alternating', 'Focus on squeezing rhomboids at top'],
    lesserKnown: false
  },
  {
    id: 'seated-cable-row',
    name: 'Seated Cable Row',
    category: 'pull', equipment: 'cable',
    primary: ['lats', 'rhomboids', 'mid-traps'], secondary: ['rear-delt', 'biceps'],
    curve: 'matching',
    curveNote: 'Horizontal cable maintains consistent tension through full ROM; resistance does not drop at peak contraction like free weights. One of the most balanced mid-back loaders.',
    form: ['Torso upright or slight lean back at end', 'Slight forward lean at start to prestretch', 'Pull handle to navel', 'Squeeze scapulae hard at end range — hold 1 second'],
    lesserKnown: false
  },
  {
    id: 'single-arm-cable-row',
    name: 'Single-Arm Cable Row',
    category: 'pull', equipment: 'cable',
    primary: ['lats', 'rhomboids'], secondary: ['rear-delt', 'biceps'],
    curve: 'matching',
    curveNote: 'Unilateral version allows rotation at end range — adds serratus engagement and fuller lat contraction. Cable maintains tension throughout unlike dumbbell rows.',
    form: ['Allow torso rotation toward cable at start', 'Drive elbow back hard past hip', 'Rotate slightly away at peak to squeeze lat fully', 'Do not use hip momentum'],
    lesserKnown: false
  },
  {
    id: 'high-cable-row',
    name: 'High Cable Row',
    category: 'pull', equipment: 'cable',
    primary: ['rear-delt', 'rhomboids', 'mid-traps'], secondary: ['lats', 'biceps'],
    curve: 'matching',
    curveNote: 'Pulling from above head angle targets upper back and rear delt fibres that low rows miss. Cable keeps tension consistent through the downward arc.',
    form: ['Pulleys at or above head height', 'Pull elbows down and back simultaneously', 'Squeeze shoulder blades at end range', 'Slight lean back for balance'],
    lesserKnown: false
  },
  {
    id: 't-bar-row',
    name: 'T-Bar Row',
    category: 'pull', equipment: 'barbell',
    primary: ['lats', 'rhomboids', 'mid-traps'], secondary: ['rear-delt', 'biceps', 'erectors'],
    curve: 'partial',
    curveNote: 'Landmine angle creates a rowing arc between horizontal and vertical pull. Very strong loading potential; chest support version removes erector fatigue variable.',
    form: ['V-handle allows neutral grip', 'Bar close to chest at top', 'Full hang at bottom', 'Keep back rigid — do not bounce'],
    lesserKnown: false
  },
  {
    id: 'machine-row-seated',
    name: 'Machine Row (Seated)',
    category: 'pull', equipment: 'machine',
    primary: ['lats', 'rhomboids', 'mid-traps'], secondary: ['rear-delt', 'biceps'],
    curve: 'matching',
    curveNote: 'Machine cam can be designed to provide matching resistance curve. Removes stabiliser requirement — allows greater focus on target muscles at high intensity.',
    form: ['Adjust seat so handles are at sternum height', 'Full stretch at start', 'Pull to torso, squeeze scapulae hard', 'Control the return — do not let weight crash'],
    lesserKnown: false
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    category: 'pull', equipment: 'cable',
    primary: ['rear-delt', 'rotator-cuff'], secondary: ['rhomboids', 'mid-traps'],
    curve: 'matching',
    curveNote: 'Rope-to-face angle loads rear delt and external rotators through their functional ROM. Cable maintains tension at peak contraction — often underloaded with free weights.',
    form: ['Rope attachment at forehead height', 'Pull rope to face, elbows high and out', 'External rotate at end — thumbs behind', 'Light weight, full ROM, slow eccentric'],
    lesserKnown: false
  },
  {
    id: 'rear-delt-fly-dumbbell',
    name: 'Rear Delt Fly (Dumbbell)',
    category: 'pull', equipment: 'dumbbell',
    primary: ['rear-delt'], secondary: ['rhomboids', 'mid-traps'],
    curve: 'opposing',
    curveNote: 'Gravity loads arm when it is hanging down — where rear delt is shortest/weakest. Resistance drops exactly as rear delt reaches peak activation at horizontal position.',
    form: ['Hinge torso to parallel with floor', 'Slight bend in elbow, locked position', 'Raise to just below shoulder height', 'Control the descent — pause at bottom'],
    lesserKnown: false
  },
  {
    id: 'rear-delt-fly-cable',
    name: 'Rear Delt Fly (Cable)',
    category: 'pull', equipment: 'cable',
    primary: ['rear-delt'], secondary: ['rhomboids', 'mid-traps'],
    curve: 'matching',
    curveNote: 'Cross-cable or single-arm setup maintains tension as arm moves into horizontal abduction — directly opposing the dumbbell problem. Peak resistance where rear delt is strongest.',
    form: ['Cables crossed: right hand to left cable, vice versa', 'Slight forward lean', 'Straight arm pull to side', 'Squeeze rear delt at full horizontal position'],
    lesserKnown: true
  },
  {
    id: 'reverse-pec-deck',
    name: 'Reverse Pec Deck',
    category: 'pull', equipment: 'machine',
    primary: ['rear-delt'], secondary: ['rhomboids', 'mid-traps'],
    curve: 'matching',
    curveNote: 'Machine cam maintains resistance through horizontal abduction arc. Best isolation for rear delt — consistent load where dumbbell flies lose tension.',
    form: ['Face pad with chest against it', 'Arms start in front at shoulder height', 'Drive elbows back and out', 'Squeeze at full retraction — hold 1 second'],
    lesserKnown: false
  },

  // ── HINGE / POSTERIOR CHAIN ──────────────────────────────────────────────────
  {
    id: 'conventional-deadlift',
    name: 'Conventional Deadlift',
    category: 'hinge', equipment: 'barbell',
    primary: ['hamstrings', 'glutes', 'erectors'], secondary: ['quads', 'lats', 'forearms'],
    curve: 'partial',
    curveNote: 'Hip extensor leverage peaks near lockout; hamstrings are on stretch at setup providing good initial load. Highest spinal load at floor-level start makes the bottom the most risky part of the curve.',
    form: ['Bar over mid-foot — not against shins yet', 'Hip hinge to bar, then legs push floor away', 'Lats engaged — protect the spine', 'Lock hips and knees simultaneously at top'],
    lesserKnown: false
  },
  {
    id: 'sumo-deadlift',
    name: 'Sumo Deadlift',
    category: 'hinge', equipment: 'barbell',
    primary: ['glutes', 'hamstrings', 'quads'], secondary: ['adductors', 'erectors', 'lats'],
    curve: 'partial',
    curveNote: 'Wide stance shifts load toward adductors and reduces ROM for similar hip extension. Torso more upright reduces spinal lever arm — better for those with long torsos.',
    form: ['Feet wide, toes pointed out 30–45°', 'Knees track toes throughout', 'Bar close to body — drag up shins', 'Drive hips through at lockout'],
    lesserKnown: false
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    category: 'hinge', equipment: 'barbell',
    primary: ['hamstrings', 'glutes'], secondary: ['erectors', 'adductors'],
    curve: 'partial',
    curveNote: 'Hip hinge with soft knees keeps hamstrings under constant tension through the lowering phase. Resistance (gravity) aligns with hamstring stretch well through mid-range; reduces at lockout.',
    form: ['Slight knee bend, maintained throughout', 'Push hips back — bar travels down legs', 'Feel hamstring stretch at mid-shin, then reverse', 'Keep back neutral — this is a hinge, not a squat'],
    lesserKnown: false
  },
  {
    id: 'single-leg-rdl',
    name: 'Single-Leg RDL',
    category: 'hinge', equipment: 'dumbbell',
    primary: ['hamstrings', 'glutes'], secondary: ['erectors', 'calves', 'core'],
    curve: 'partial',
    curveNote: 'Unilateral loading adds hip abductor demand and reveals bilateral asymmetries. Same loading profile as RDL but with higher core and stabiliser demands.',
    form: ['Working leg slight bend', 'Opposite leg extends behind as torso drops', 'Keep hips square to floor throughout', 'Touch weight to mid-shin level then drive up'],
    lesserKnown: false
  },
  {
    id: 'stiff-leg-deadlift',
    name: 'Stiff-Leg Deadlift',
    category: 'hinge', equipment: 'barbell',
    primary: ['hamstrings', 'erectors'], secondary: ['glutes'],
    curve: 'partial',
    curveNote: 'Straighter legs than RDL places more load on erectors alongside hamstrings. Greater lower back involvement — caution with spinal loading.',
    form: ['Knees completely straight or near-straight', 'Hip hinge with tight back', 'Lower to just below knee level for most', 'Strong brace throughout'],
    lesserKnown: false
  },
  {
    id: 'good-morning',
    name: 'Good Morning',
    category: 'hinge', equipment: 'barbell',
    primary: ['hamstrings', 'erectors', 'glutes'], secondary: ['abs'],
    curve: 'partial',
    curveNote: 'Barbell on back with forward hinge creates large lever arm for spinal extensors — one of the highest erector loaders. Hamstring tension through the hinge provides concurrent hamstring work.',
    form: ['Bar on traps like a squat', 'Push hips back as you hinge forward', 'Maintain neutral spine throughout', 'Stop at parallel with floor or where hamstrings limit'],
    lesserKnown: false
  },
  {
    id: 'hyperextension',
    name: 'Back Extension / Hyperextension',
    category: 'hinge', equipment: 'bodyweight',
    primary: ['erectors', 'glutes'], secondary: ['hamstrings'],
    curve: 'matching',
    curveNote: 'Gravity provides maximum resistance at horizontal body position — exactly where erectors and glutes are most active. Load increases progressively through the concentric phase.',
    form: ['Hips on pad — not waist', 'Squeeze glutes at top of each rep', 'Add plate to chest for progression', 'Controlled descent — do not drop'],
    lesserKnown: false
  },
  {
    id: 'reverse-hyperextension',
    name: 'Reverse Hyperextension',
    category: 'hinge', equipment: 'machine',
    primary: ['glutes', 'hamstrings'], secondary: ['erectors'],
    curve: 'matching',
    curveNote: 'Legs swing up providing resistance through glute extension arc; lumbar traction at the bottom decompresses discs — unique among posterior chain exercises. One of few exercises that actively decompresses the spine.',
    form: ['Hips at edge of pad, torso firm', 'Swing legs up using glutes, not momentum', 'Brief pause at top', 'Lower with control — let spinal traction happen'],
    lesserKnown: true
  },
  {
    id: 'hip-thrust-barbell',
    name: 'Barbell Hip Thrust',
    category: 'hinge', equipment: 'barbell',
    primary: ['glutes'], secondary: ['hamstrings', 'quads'],
    curve: 'matching',
    curveNote: 'At the top of the thrust, glutes are at peak contraction AND maximum moment arm for the barbell. This is one of few exercises where resistance aligns precisely with peak glute output.',
    form: ['Upper back on bench, bar across hip crease', 'Drive hips to horizontal — squeeze glutes hard', 'Do not hyperextend lumbar at top', 'Pad or foam on bar for comfort'],
    lesserKnown: false
  },
  {
    id: 'cable-pull-through',
    name: 'Cable Pull-Through',
    category: 'hinge', equipment: 'cable',
    primary: ['glutes', 'hamstrings'], secondary: ['erectors'],
    curve: 'matching',
    curveNote: 'Low pulley behind provides horizontal tension through the hip extension arc — resistance is highest as glutes reach lockout, matching glute strength curve better than barbell hip thrust in some setups.',
    form: ['Straddle cable, facing away from stack', 'Hip hinge forward, rope between legs', 'Drive hips forward to standing', 'Squeeze glutes hard at top'],
    lesserKnown: false
  },

  // ── SHOULDERS ────────────────────────────────────────────────────────────────
  {
    id: 'barbell-overhead-press',
    name: 'Barbell Overhead Press',
    category: 'shoulders', equipment: 'barbell',
    primary: ['front-delt', 'mid-delt'], secondary: ['triceps', 'serratus', 'rotator-cuff'],
    curve: 'partial',
    curveNote: 'Gravity provides maximum resistance at 90° abduction — strongest mid-range — but resistance drops near lockout where front delt is fully shortened. Heaviest of all shoulder pressing movements.',
    form: ['Bar rests on clavicle/front delts in rack position', 'Press in straight line over ears', 'Lock out hard at top', 'Brace core and glutes — this is a full body lift'],
    lesserKnown: false
  },
  {
    id: 'dumbbell-overhead-press',
    name: 'Dumbbell Overhead Press',
    category: 'shoulders', equipment: 'dumbbell',
    primary: ['front-delt', 'mid-delt'], secondary: ['triceps', 'rotator-cuff'],
    curve: 'partial',
    curveNote: 'Greater ROM than barbell and independent arm movement. Neutral grip option reduces shoulder impingement risk. Same resistance profile — peak at 90°.',
    form: ['Start with dumbbells at ear level', 'Press to directly overhead, not in front', 'Slight arc inward at top is natural', 'Seated or standing — both effective'],
    lesserKnown: false
  },
  {
    id: 'machine-shoulder-press',
    name: 'Machine Shoulder Press',
    category: 'shoulders', equipment: 'machine',
    primary: ['front-delt', 'mid-delt'], secondary: ['triceps'],
    curve: 'partial',
    curveNote: 'Cam profile varies; consistent loading without stabiliser demand allows higher shoulder-specific volume. Handles reduce wrist and shoulder stress vs barbell.',
    form: ['Adjust seat so handles are at shoulder height', 'Press to full extension — do not short-ROM', 'Control the descent', 'Elbows at 90° or slight forward cant at start'],
    lesserKnown: false
  },
  {
    id: 'arnold-press',
    name: 'Arnold Press',
    category: 'shoulders', equipment: 'dumbbell',
    primary: ['front-delt', 'mid-delt'], secondary: ['triceps', 'rotator-cuff'],
    curve: 'partial',
    curveNote: 'Rotation from supinated at bottom to pronated at top adds rotational component — recruits more deltoid fibres across the arc. Does not significantly improve the resistance curve but adds variety.',
    form: ['Start palms facing you at shoulder height', 'Rotate to facing forward as you press', 'Full extension at top', 'Full return to supinated position at bottom'],
    lesserKnown: false
  },
  {
    id: 'lateral-raise-dumbbell',
    name: 'Lateral Raise (Dumbbell)',
    category: 'shoulders', equipment: 'dumbbell',
    primary: ['mid-delt'], secondary: ['front-delt', 'rear-delt', 'rotator-cuff'],
    curve: 'opposing',
    curveNote: 'Gravity pulls arm straight down — maximum resistance at horizontal where mid-delt is at peak activation, but zero resistance at bottom where deltoid needs most help initiating the movement.',
    form: ['Slight forward lean improves mid-delt angle', 'Lead with elbows, not wrists', 'Stop at shoulder height — going higher recruits traps', 'Slow controlled eccentric'],
    lesserKnown: false
  },
  {
    id: 'lateral-raise-cable',
    name: 'Lateral Raise (Cable)',
    category: 'shoulders', equipment: 'cable',
    primary: ['mid-delt'], secondary: ['front-delt', 'rear-delt'],
    curve: 'matching',
    curveNote: 'Low pulley from below provides tension at the bottom of the raise — exactly where dumbbell lateral raise is zero. Resistance maintained from start to finish.',
    form: ['Low pulley, single arm', 'Cable crosses in front of body', 'Raise to just above shoulder height', 'Control descent — cable provides eccentric load'],
    lesserKnown: false
  },
  {
    id: 'lateral-raise-machine',
    name: 'Lateral Raise (Machine)',
    category: 'shoulders', equipment: 'machine',
    primary: ['mid-delt'], secondary: ['rear-delt'],
    curve: 'matching',
    curveNote: 'Well-designed lateral raise machines provide tension from bottom to top via cam. Removes wrist stabiliser requirement allowing full isolation of mid-delt.',
    form: ['Pad against lower arm, just above elbow', 'Drive elbows out, not hands up', 'Stop at shoulder level', 'Full return for each rep — no partial reps'],
    lesserKnown: false
  },
  {
    id: 'upright-row',
    name: 'Upright Row',
    category: 'shoulders', equipment: 'barbell',
    primary: ['mid-delt'], secondary: ['front-delt', 'biceps', 'rhomboids', 'traps'],
    curve: 'partial',
    curveNote: 'Similar to lateral raise profile — gravity loads best at horizontal. Risk of shoulder impingement with narrow grip; wide grip safer. Good mid-delt and upper trap recruiter.',
    form: ['Wider than shoulder grip reduces impingement', 'Elbows lead above wrists', 'Pull to lower chest / nipple height only', 'Avoid EZ bar if shoulder discomfort occurs'],
    lesserKnown: false
  },
  {
    id: 'cuban-rotation',
    name: 'Cuban Rotation',
    category: 'shoulders', equipment: 'dumbbell',
    primary: ['rotator-cuff', 'rear-delt'], secondary: ['mid-delt'],
    curve: 'partial',
    curveNote: 'External rotation from 90° abducted position directly trains external rotators through functional ROM. Strengthens infraspinatus and teres minor — critical for shoulder health and longevity.',
    form: ['Upright row to 90° then externally rotate', 'Upper arm stays parallel to floor throughout rotation', 'Light weight — this is rotator cuff work', 'Full external rotation at top, controlled return'],
    lesserKnown: true
  },
  {
    id: 'cable-y-raise',
    name: 'Cable Y-Raise',
    category: 'shoulders', equipment: 'cable',
    primary: ['mid-traps', 'rear-delt', 'rotator-cuff'], secondary: ['rhomboids'],
    curve: 'matching',
    curveNote: 'Y-shape scapular raise directly targets lower and mid trap fibres neglected by most exercises. Cable maintains tension through the diagonal raise arc.',
    form: ['Face the cable, low pulley', 'Raise arms in Y-shape diagonal, thumbs up', 'Retract scapulae at top', 'Very light weight — scapular stabilisers have low strength ceiling'],
    lesserKnown: true
  },

  // ── BICEPS ───────────────────────────────────────────────────────────────────
  {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    category: 'arms', equipment: 'barbell',
    primary: ['biceps'], secondary: ['brachialis', 'brachioradialis'],
    curve: 'partial',
    curveNote: 'Peak moment arm at ~90° elbow flexion; gravity-based resistance then drops as arm curls to full contraction. Heaviest bicep exercise but curve mismatch means top-range bicep is underloaded.',
    form: ['Elbows pinned to sides — do not swing', 'Supinated grip throughout', 'Full extension at bottom', 'Squeeze at top — do not just stop halfway'],
    lesserKnown: false
  },
  {
    id: 'ez-bar-curl',
    name: 'EZ-Bar Curl',
    category: 'arms', equipment: 'barbell',
    primary: ['biceps', 'brachialis'], secondary: ['brachioradialis'],
    curve: 'partial',
    curveNote: 'Semi-supinated grip reduces bicep peak contribution but adds brachialis. Same partial curve as straight bar. Easier on wrists for high volume.',
    form: ['Grip outer angles of EZ bar', 'Same mechanics as barbell curl', 'Controlled eccentric', 'Do not let elbows drift forward'],
    lesserKnown: false
  },
  {
    id: 'dumbbell-curl-standing',
    name: 'Dumbbell Curl (Standing)',
    category: 'arms', equipment: 'dumbbell',
    primary: ['biceps'], secondary: ['brachialis', 'brachioradialis'],
    curve: 'partial',
    curveNote: 'Same gravity profile as barbell curl with added wrist supination freedom. Supinating through the curl recruits bicep fully — that rotation is the bicep\'s primary function.',
    form: ['Supinate as you curl — palm rotates upward', 'Alternating or simultaneous both work', 'Elbows stay at sides', 'Full extension each rep'],
    lesserKnown: false
  },
  {
    id: 'incline-dumbbell-curl',
    name: 'Incline Dumbbell Curl',
    category: 'arms', equipment: 'dumbbell',
    primary: ['biceps'], secondary: ['brachialis'],
    curve: 'partial',
    curveNote: 'Incline position shifts shoulder into extension — puts bicep on longer length at the start of the curl. Better loading at the bottom of the ROM vs standing curl.',
    form: ['45–60° incline', 'Arms hang naturally behind torso at bottom', 'Curl without elbow drifting forward', 'Full supination at top'],
    lesserKnown: false
  },
  {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    category: 'arms', equipment: 'dumbbell',
    primary: ['brachialis', 'brachioradialis'], secondary: ['biceps'],
    curve: 'partial',
    curveNote: 'Neutral grip removes supination — shifts emphasis from bicep to brachialis and brachioradialis. Brachialis is largest elbow flexor but often undertrained due to pronation bias.',
    form: ['Thumbs up grip throughout — no rotation', 'Same elbow mechanics as regular curl', 'Can be done alternating or cross-body', 'Full extension at bottom'],
    lesserKnown: false
  },
  {
    id: 'preacher-curl-barbell',
    name: 'Preacher Curl (Barbell)',
    category: 'arms', equipment: 'barbell',
    primary: ['biceps'], secondary: ['brachialis'],
    curve: 'partial',
    curveNote: 'Preacher pad fixes elbows in front of torso — eliminates cheating. Resistance profile similar to standing curl but with stricter isolation. Short head bicep emphasis due to shoulder flexion position.',
    form: ['Upper arm fully on pad — no gap', 'Full extension — do not stop short', 'Slow eccentric is key on this exercise', 'Do not bounce at bottom — elbow injury risk'],
    lesserKnown: false
  },
  {
    id: 'spider-curl',
    name: 'Spider Curl',
    category: 'arms', equipment: 'barbell',
    primary: ['biceps'], secondary: ['brachialis'],
    curve: 'matching',
    curveNote: 'Lying prone on incline bench with arms hanging down — gravity assists at peak contraction (top of curl) rather than fighting it. One of few exercises that loads bicep better in the shortened position.',
    form: ['Chest on top of incline bench, arms hanging', 'Curl against gravity toward face', 'Peak contraction is easy to feel — squeeze hard', 'Full extension between reps'],
    lesserKnown: true
  },
  {
    id: 'decline-curl',
    name: 'Decline Curl (Carter Curl)',
    category: 'arms', equipment: 'dumbbell',
    primary: ['biceps'], secondary: ['brachialis'],
    curve: 'matching',
    curveNote: 'Decline position means the gravity vector better opposes bicep contraction at the top of the rep — the arm curls up a decline slope, maintaining moment arm into full flexion. Superior resistance at peak contraction vs standard curl.',
    form: ['Lie face up on decline bench', 'Arms hang on decline side', 'Curl up toward ceiling', 'Resistance feels hardest at the top — embrace it'],
    lesserKnown: true
  },
  {
    id: 'low-cable-curl',
    name: 'Low Cable Curl',
    category: 'arms', equipment: 'cable',
    primary: ['biceps'], secondary: ['brachialis'],
    curve: 'matching',
    curveNote: 'Low pulley means cable tension increases as arm curls up — maintaining load into peak contraction where barbell curl drops off. Best matching resistance curve among curl variations for full-range bicep loading.',
    form: ['Low pulley, SZ-bar or straight bar', 'Stand close to cable stack', 'Full supination at top', 'Elbows stay at sides'],
    lesserKnown: false
  },
  {
    id: 'drag-curl',
    name: 'Drag Curl',
    category: 'arms', equipment: 'barbell',
    primary: ['biceps'], secondary: ['brachialis'],
    curve: 'partial',
    curveNote: 'Bar stays in contact with body as it drags upward — elbows move backward rather than forward. This position virtually eliminates front delt contribution, forcing pure bicep work.',
    form: ['Bar starts at hips', 'Drag bar up torso — elbows go back, not forward', 'Bar stays touching body throughout', 'Squeeze hard at the top'],
    lesserKnown: true
  },
  {
    id: 'concentration-curl',
    name: 'Concentration Curl',
    category: 'arms', equipment: 'dumbbell',
    primary: ['biceps'], secondary: [],
    curve: 'partial',
    curveNote: 'Elbow braced on inner thigh with arm vertical — gravity profile similar to preacher curl. Removes all cheating. Peak contraction is fully achieved and easy to maintain.',
    form: ['Elbow on inner thigh, not middle of quad', 'Supinate fully at peak', 'Full extension at bottom', 'No body movement — pure arm'],
    lesserKnown: false
  },
  {
    id: 'cross-body-hammer-curl',
    name: 'Cross-Body Hammer Curl',
    category: 'arms', equipment: 'dumbbell',
    primary: ['brachialis', 'brachioradialis'], secondary: ['biceps'],
    curve: 'partial',
    curveNote: 'Neutral grip curl across body increases brachioradialis activation. Angle changes the loading slightly from standard hammer curl — good variation for complete forearm/elbow flexor development.',
    form: ['Curl across body toward opposite shoulder', 'Neutral grip throughout', 'Controlled lowering', 'Alternate arms'],
    lesserKnown: false
  },
  {
    id: 'zottman-curl',
    name: 'Zottman Curl',
    category: 'arms', equipment: 'dumbbell',
    primary: ['biceps', 'brachioradialis'], secondary: ['brachialis', 'forearms'],
    curve: 'partial',
    curveNote: 'Supinated on the way up (bicep concentric), pronated on the way down (brachioradialis eccentric). Trains both supinator and pronator grip strength in one movement.',
    form: ['Curl up with supinated grip', 'Rotate to pronated at the top', 'Lower with pronated grip — slow eccentric', 'Rotate back to supinated at bottom for next rep'],
    lesserKnown: true
  },
  {
    id: 'reverse-curl',
    name: 'Reverse Curl',
    category: 'arms', equipment: 'barbell',
    primary: ['brachioradialis', 'forearms'], secondary: ['brachialis', 'biceps'],
    curve: 'partial',
    curveNote: 'Pronated grip nearly eliminates bicep supination contribution; forces brachioradialis and wrist extensors to work. Develops often-neglected forearm extensor side for balanced elbow health.',
    form: ['Pronated / overhand grip', 'Elbows at sides', 'Full extension between reps', 'Do not allow wrists to break backward'],
    lesserKnown: false
  },

  // ── TRICEPS ──────────────────────────────────────────────────────────────────
  {
    id: 'cable-pushdown-rope',
    name: 'Cable Tricep Pushdown (Rope)',
    category: 'arms', equipment: 'cable',
    primary: ['triceps'], secondary: [],
    curve: 'matching',
    curveNote: 'High pulley with rope maintains cable tension at full elbow extension — where triceps are strongest and where free weights lose all resistance. Flaring rope ends at bottom adds lateral head recruitment.',
    form: ['High pulley, rope attachment', 'Elbows pinned to sides throughout', 'Flare rope ends at bottom of movement', 'Pause at full extension — squeeze hard'],
    lesserKnown: false
  },
  {
    id: 'cable-pushdown-bar',
    name: 'Cable Tricep Pushdown (Bar)',
    category: 'arms', equipment: 'cable',
    primary: ['triceps'], secondary: [],
    curve: 'matching',
    curveNote: 'Same cable-at-lockout benefit as rope, with more load possible due to bilateral fixed grip. Good for heavy tricep volume.',
    form: ['Elbows stay pinned to torso', 'Full extension at bottom', 'Slight forward lean for body alignment', 'Controlled return — do not let cable yank arms up'],
    lesserKnown: false
  },
  {
    id: 'skullcrusher-barbell',
    name: 'Skullcrusher (Barbell)',
    category: 'arms', equipment: 'barbell',
    primary: ['triceps'], secondary: [],
    curve: 'partial',
    curveNote: 'Long head tricep stretch achieved at the bottom when elbows are bent. However, resistance drops at full extension where triceps should be strongest. Best at mid-range loading.',
    form: ['Lower bar to forehead level — not skull', 'Elbows stay over chest, not drifting back', 'Full extension at top', 'Keep upper arms stationary'],
    lesserKnown: false
  },
  {
    id: 'skullcrusher-ez',
    name: 'Skullcrusher (EZ-Bar)',
    category: 'arms', equipment: 'barbell',
    primary: ['triceps'], secondary: [],
    curve: 'partial',
    curveNote: 'EZ bar reduces wrist stress in pronated-skullcrusher position. Same resistance profile as straight bar; slightly less elbow valgus stress.',
    form: ['Semi-pronated grip on outer angles', 'Same mechanics as barbell version', 'Lower toward forehead or slightly behind head', 'Full extension at top'],
    lesserKnown: false
  },
  {
    id: 'jm-press',
    name: 'JM Press',
    category: 'arms', equipment: 'barbell',
    primary: ['triceps'], secondary: ['chest', 'front-delt'],
    curve: 'partial',
    curveNote: 'Hybrid between close-grip bench and skullcrusher. Bar path goes to throat, allowing heavier loading than skullcrusher while maintaining more tricep specificity than CGBP. Unique loading profile for tricep mid-range.',
    form: ['Close grip, bar lowers to throat/sternum', 'Elbows flare slightly — not straight down like skull', 'This is heavier than skullcrushers typically', 'Full extension at lockout'],
    lesserKnown: true
  },
  {
    id: 'overhead-tricep-extension-cable',
    name: 'Overhead Tricep Extension (Cable)',
    category: 'arms', equipment: 'cable',
    primary: ['triceps'], secondary: [],
    curve: 'matching',
    curveNote: 'Overhead position puts long head of tricep under maximum stretch. Low pulley behind provides tension through the overhead extension arc — better than dumbbell version which has no tension at peak stretch.',
    form: ['Face away from low cable, rope overhead', 'Elbows forward, upper arm stationary', 'Extend to full lockout overhead', 'Control return — do not let it snap back'],
    lesserKnown: false
  },
  {
    id: 'overhead-tricep-extension-dumbbell',
    name: 'Overhead Tricep Extension (Dumbbell)',
    category: 'arms', equipment: 'dumbbell',
    primary: ['triceps'], secondary: [],
    curve: 'opposing',
    curveNote: 'Dumbbell weight loads tricep at full extension (lockout) where it is strongest, but provides near-zero resistance at the stretched position overhead where long head is maximally recruited.',
    form: ['Hold dumbbell with both hands behind head', 'Elbows stay close together, pointing forward', 'Full extension at top', 'Control return to full stretch'],
    lesserKnown: false
  },
  {
    id: 'tricep-dips',
    name: 'Tricep Dips (Parallel Bars)',
    category: 'arms', equipment: 'bodyweight',
    primary: ['triceps', 'chest'], secondary: ['front-delt'],
    curve: 'partial',
    curveNote: 'Upright torso minimises chest recruitment; triceps handle lockout. Gravity loads best in the bottom half. Weighted via belt allows progressive overload.',
    form: ['Upright torso for tricep emphasis', 'Elbows close to body', 'Lower until slight shoulder stretch', 'Full lockout at top — squeeze triceps'],
    lesserKnown: false
  },
  {
    id: 'carter-extension',
    name: 'Carter Extension',
    category: 'arms', equipment: 'dumbbell',
    primary: ['triceps'], secondary: [],
    curve: 'matching',
    curveNote: 'Lying on decline bench and lowering dumbbells overhead in an arc behind head — gravity peaks resistance at the most stretched position of the tricep long head, opposite of standing overhead extension.',
    form: ['Decline bench, dumbbells lowered behind head', 'Elbows stay high — gravity does the work on descent', 'Extend to above chest at top, not fully overhead', 'Slow eccentric — feel the stretch'],
    lesserKnown: true
  },
  {
    id: 'tate-press',
    name: 'Tate Press',
    category: 'arms', equipment: 'dumbbell',
    primary: ['triceps'], secondary: [],
    curve: 'partial',
    curveNote: 'Dumbbells lowered in pronated position toward chest then pressed back to vertical. Unique movement pattern that loads lateral and medial tricep heads in a different arc than pushdowns.',
    form: ['Lie flat, dumbbells vertical over chest to start', 'Pivot elbows outward, lower dumbbell tips to chest', 'Extend back to vertical using triceps only', 'Keep upper arms stationary'],
    lesserKnown: true
  },
  {
    id: 'diamond-push-up',
    name: 'Diamond Push-Up',
    category: 'arms', equipment: 'bodyweight',
    primary: ['triceps'], secondary: ['chest', 'front-delt'],
    curve: 'partial',
    curveNote: 'Hands close together under sternum shifts load to triceps. Bodyweight provides familiar descending resistance profile — moderate difficulty accessible without equipment.',
    form: ['Hands form diamond shape under sternum', 'Elbows track backward along torso', 'Chest touches hands at bottom', 'Full extension at top'],
    lesserKnown: false
  },

  // ── QUADS ────────────────────────────────────────────────────────────────────
  {
    id: 'back-squat',
    name: 'Back Squat',
    category: 'legs', equipment: 'barbell',
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors', 'erectors'],
    curve: 'partial',
    curveNote: 'Quad leverage peaks in the hole (~90° knee bend). Gravity loads progressively as bar descends. High-bar favours quads; low-bar shifts to posterior chain. Best overall compound leg exercise.',
    form: ['Bar on traps (high) or rear delts (low)', 'Knees track toes', 'Hip crease below knee at minimum', 'Drive knees out and up out of the hole'],
    lesserKnown: false
  },
  {
    id: 'front-squat',
    name: 'Front Squat',
    category: 'legs', equipment: 'barbell',
    primary: ['quads'], secondary: ['glutes', 'erectors', 'core'],
    curve: 'partial',
    curveNote: 'Bar in front requires more upright torso — quad demand is highest and posterior chain contribution reduced. Best barbell movement for pure quad development.',
    form: ['Clean or cross-arm rack position', 'Elbows high throughout — do not drop', 'Upright torso is the point', 'Full depth — ankle mobility critical here'],
    lesserKnown: false
  },
  {
    id: 'hack-squat-machine',
    name: 'Hack Squat (Machine)',
    category: 'legs', equipment: 'machine',
    primary: ['quads', 'glutes'], secondary: ['hamstrings'],
    curve: 'partial',
    curveNote: 'Machine locks path to maintain constant resistance through quad range. Foot position determines quad vs glute emphasis. High foot placement = glutes; low = quads.',
    form: ['Shoulders under pads firmly', 'Low foot placement for quad emphasis', 'Full depth — do not short-ROM', 'Drive through heels to engage glutes or balls of feet for quads'],
    lesserKnown: false
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    category: 'legs', equipment: 'machine',
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors'],
    curve: 'partial',
    curveNote: 'Resistance from sled weight consistent throughout ROM. High/wide foot placement recruits glutes and hamstrings more; low/narrow placement isolates quads.',
    form: ['Full ROM — do not lock out knees at top', 'Do not let lower back peel off pad', 'Control the descent', 'Foot placement determines muscle emphasis'],
    lesserKnown: false
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    category: 'legs', equipment: 'dumbbell',
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors', 'core'],
    curve: 'partial',
    curveNote: 'Rear foot elevated increases ROM and forces greater hip flexor stretch on trailing leg. Quad loading is strong through full depth. Also a significant hip flexor mobility tool.',
    form: ['Rear foot on bench — toes or top of foot', 'Front foot far enough forward to prevent forward knee drift', 'Drop straight down, not forward', 'Hands on hip or dumbbells at sides'],
    lesserKnown: false
  },
  {
    id: 'lunge-walking',
    name: 'Walking Lunge',
    category: 'legs', equipment: 'dumbbell',
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors', 'core'],
    curve: 'partial',
    curveNote: 'Forward-stepping version adds balance and hip flexor component to standard lunge. Continuous movement means less stability than reverse lunge — more metabolic demand.',
    form: ['Step far enough forward so knee does not travel over toe', 'Back knee drops to just above floor', 'Drive through front heel to rise', 'Alternate legs, walking forward'],
    lesserKnown: false
  },
  {
    id: 'reverse-lunge',
    name: 'Reverse Lunge',
    category: 'legs', equipment: 'dumbbell',
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors'],
    curve: 'partial',
    curveNote: 'Stepping backward is easier on knees than forward lunge — better for those with knee sensitivity. More glute emphasis than forward lunge due to longer step requirement.',
    form: ['Step back so front knee stays behind or over toe', 'Lower back knee toward floor', 'Push through front foot to return', 'Stay upright — do not lean forward'],
    lesserKnown: false
  },
  {
    id: 'leg-extension',
    name: 'Leg Extension',
    category: 'legs', equipment: 'machine',
    primary: ['quads'], secondary: [],
    curve: 'opposing',
    curveNote: 'Machine provides peak resistance at full extension — where quads are fully shortened and moment arm is actually weakest (due to patellar tendon angle). Most resistance occurs where quads produce least force.',
    form: ['Adjust pad so it sits just above ankle', 'Full extension — squeeze quads hard', 'Slow eccentric for knee health', 'Avoid using momentum — this is isolation work'],
    lesserKnown: false
  },
  {
    id: 'sissy-squat',
    name: 'Sissy Squat',
    category: 'legs', equipment: 'bodyweight',
    primary: ['quads'], secondary: ['hip-flexors'],
    curve: 'matching',
    curveNote: 'Backward lean with knees dropping forward loads quads through their full contraction range. Resistance profile closely matches quad strength curve — peak load aligns with peak quad output.',
    form: ['Hold something for balance', 'Lean backward as knees drop forward', 'Heels rise — knees track over toes', 'Full return to standing'],
    lesserKnown: true
  },
  {
    id: 'atg-split-squat',
    name: 'ATG Split Squat (Knees Over Toes)',
    category: 'legs', equipment: 'bodyweight',
    primary: ['quads'], secondary: ['glutes', 'hip-flexors'],
    curve: 'partial',
    curveNote: 'Deep knee flexion with intentional knee-over-toe position strengthens patellar tendon, quad insertion, and vastus medialis. Builds knee resilience that conventional squats do not train.',
    form: ['Front foot elevated slightly', 'Allow knee to travel forward over toes deliberately', 'As deep as mobility allows — goal is heel to glute', 'Progress very slowly — tendon adaptation takes months'],
    lesserKnown: true
  },
  {
    id: 'step-up',
    name: 'Step-Up',
    category: 'legs', equipment: 'dumbbell',
    primary: ['quads', 'glutes'], secondary: ['hamstrings'],
    curve: 'partial',
    curveNote: 'Single-leg exercise with clear unilateral loading. Box height determines difficulty — higher box = more glute, lower box = more quad dominant.',
    form: ['Full foot on box', 'Drive through heel of elevated foot', 'Do not push off back foot', 'Control the step down'],
    lesserKnown: false
  },

  // ── HAMSTRINGS ───────────────────────────────────────────────────────────────
  {
    id: 'lying-leg-curl',
    name: 'Lying Leg Curl',
    category: 'legs', equipment: 'machine',
    primary: ['hamstrings'], secondary: ['calves'],
    curve: 'partial',
    curveNote: 'Machine provides resistance through knee flexion arc; load curve varies by machine cam. Hamstrings in hip-extended position shortens them slightly — more tension early in the curl.',
    form: ['Pad just above ankles', 'Full extension between reps', 'Squeeze hard at peak contraction', 'Do not let hips lift off pad'],
    lesserKnown: false
  },
  {
    id: 'seated-leg-curl',
    name: 'Seated Leg Curl',
    category: 'legs', equipment: 'machine',
    primary: ['hamstrings'], secondary: [],
    curve: 'matching',
    curveNote: 'Seated position keeps hip flexed — hamstrings are on more stretch at the start, increasing the load in a more lengthened position than lying curl. Superior activation of hamstring belly.',
    form: ['Thigh pad presses down on quads', 'Full ROM — do not partial rep', 'Control the eccentric', 'Hip angle determines hamstring position — adjust seat accordingly'],
    lesserKnown: false
  },
  {
    id: 'nordic-hamstring-curl',
    name: 'Nordic Hamstring Curl',
    category: 'legs', equipment: 'bodyweight',
    primary: ['hamstrings'], secondary: ['glutes', 'erectors'],
    curve: 'matching',
    curveNote: 'Pure eccentric knee flexion from kneeling position. Hamstring works maximally from lengthened position — peak force in the range where most hamstring injuries occur. Strongest evidence base for hamstring injury prevention.',
    form: ['Kneel with feet anchored', 'Lower body toward floor as slowly as possible', 'Catch fall with hands at bottom if needed', 'Drive back up with glute/hamstring combined'],
    lesserKnown: true
  },
  {
    id: 'glute-ham-raise',
    name: 'Glute-Ham Raise (GHR)',
    category: 'legs', equipment: 'machine',
    primary: ['hamstrings', 'glutes'], secondary: ['erectors', 'calves'],
    curve: 'matching',
    curveNote: 'Only exercise that loads hamstrings as both hip extensors AND knee flexors simultaneously. Unique concurrent activation of both functions creates high hamstring tension throughout the full ROM.',
    form: ['Feet secured in GHR machine rollers', 'Full descent, body parallel to floor', 'Drive toes into pad to initiate curl up', 'Squeeze glutes and hamstrings hard throughout'],
    lesserKnown: true
  },
  {
    id: 'swiss-ball-leg-curl',
    name: 'Swiss Ball Leg Curl',
    category: 'legs', equipment: 'bodyweight',
    primary: ['hamstrings', 'glutes'], secondary: ['calves', 'core'],
    curve: 'partial',
    curveNote: 'Hip extension with knee flexion on unstable surface. Instability adds core and glute demand. Good bodyweight alternative when no leg curl machine available.',
    form: ['Hips bridged up throughout', 'Roll ball toward glutes using feet', 'Keep hips level — do not sag', 'Control the return'],
    lesserKnown: false
  },

  // ── GLUTES ───────────────────────────────────────────────────────────────────
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    category: 'legs', equipment: 'bodyweight',
    primary: ['glutes'], secondary: ['hamstrings'],
    curve: 'matching',
    curveNote: 'Floor-based version of hip thrust. Glutes maximally contracted at the top where resistance from bodyweight/load is also highest. Good starting point before barbell hip thrust.',
    form: ['Feet flat, close to glutes', 'Drive hips to full extension', 'Squeeze glutes at top — do not hyperextend lumbar', 'Slow down on the return'],
    lesserKnown: false
  },
  {
    id: 'single-leg-hip-thrust',
    name: 'Single-Leg Hip Thrust',
    category: 'legs', equipment: 'bodyweight',
    primary: ['glutes'], secondary: ['hamstrings', 'core'],
    curve: 'matching',
    curveNote: 'Unilateral version doubles the load on the working glute. Reveals asymmetries and trains hip stability simultaneously. Excellent progression before weighted bilateral thrust.',
    form: ['Non-working leg in air or crossed over', 'Drive hips to full extension', 'Level hips at the top', 'Control descent — single leg is slower'],
    lesserKnown: false
  },
  {
    id: 'cable-glute-kickback',
    name: 'Cable Glute Kickback',
    category: 'legs', equipment: 'cable',
    primary: ['glutes'], secondary: ['hamstrings'],
    curve: 'matching',
    curveNote: 'Low pulley provides increasing resistance as leg extends behind body — aligns with glute activation pattern which peaks at full hip extension. Better than dumbbell kickback which loses resistance as leg rises.',
    form: ['Ankle cuff on low pulley', 'Drive leg straight back, not up', 'Squeeze glute hard at full extension', 'Do not rotate hip to compensate'],
    lesserKnown: false
  },
  {
    id: 'frog-pump',
    name: 'Frog Pump',
    category: 'legs', equipment: 'bodyweight',
    primary: ['glutes'], secondary: [],
    curve: 'matching',
    curveNote: 'Feet together soles touching, pelvis-level hip thrust. Butterfly hip position shortens hip flexors and forces greater glute engagement. Provides strong glute burn without hip flexor interference.',
    form: ['Lie on back, soles of feet together', 'Feet as close to body as comfortable', 'Drive hips straight up', 'High rep pump — burn is the point'],
    lesserKnown: true
  },
  {
    id: 'lateral-band-walk',
    name: 'Lateral Band Walk',
    category: 'legs', equipment: 'bodyweight',
    primary: ['abductors', 'glutes'], secondary: ['quads'],
    curve: 'matching',
    curveNote: 'Band maintains constant lateral tension through the full step arc — glute medius and TFL loaded from start to finish. Critical for hip stability and knee health.',
    form: ['Band above knees or at ankles', 'Slight squat position throughout', 'Steps small and controlled', 'Keep hips level — do not bob'],
    lesserKnown: false
  },
  {
    id: 'clamshell',
    name: 'Clamshell',
    category: 'legs', equipment: 'bodyweight',
    primary: ['abductors', 'glutes'], secondary: [],
    curve: 'partial',
    curveNote: 'Hip external rotation in lying position targets glute medius and external rotators. Important for hip stability work but requires band to add meaningful resistance.',
    form: ['Lie on side, hips stacked', 'Rotate top knee toward ceiling', 'Keep feet together throughout', 'Add resistance band for progression'],
    lesserKnown: false
  },

  // ── CALVES & LOWER LEG ───────────────────────────────────────────────────────
  {
    id: 'standing-calf-raise-machine',
    name: 'Standing Calf Raise (Machine)',
    category: 'legs', equipment: 'machine',
    primary: ['calves'], secondary: [],
    curve: 'matching',
    curveNote: 'Gastrocnemius (two-joint muscle) is trained with knee straight; machine provides consistent load through full plantarflexion. Deep stretch at bottom is critical for full muscle loading.',
    form: ['Full ROM — deep stretch at bottom', 'Do not bounce out of stretch', 'Squeeze at peak contraction', 'Slow eccentric — calf responds to time under tension'],
    lesserKnown: false
  },
  {
    id: 'seated-calf-raise',
    name: 'Seated Calf Raise',
    category: 'legs', equipment: 'machine',
    primary: ['calves'], secondary: [],
    curve: 'matching',
    curveNote: 'Knees bent position shortens gastrocnemius — soleus takes over as primary mover. Soleus is a postural muscle that responds well to higher reps under sustained load.',
    form: ['Knee at 90° or less', 'Pad above knees, not on shins', 'Full stretch at bottom', 'Full plantarflexion at top'],
    lesserKnown: false
  },
  {
    id: 'single-leg-calf-raise',
    name: 'Single-Leg Calf Raise',
    category: 'legs', equipment: 'bodyweight',
    primary: ['calves'], secondary: [],
    curve: 'matching',
    curveNote: 'Body weight on one leg doubles the load vs bilateral raise. Step edge allows full dorsiflexion at bottom. Most accessible progressive calf exercise without equipment.',
    form: ['Stand on step edge — heel off', 'Non-working foot crossed behind', 'Full ROM — especially the deep stretch', 'Add dumbbell in hand for progression'],
    lesserKnown: false
  },
  {
    id: 'tibialis-raise',
    name: 'Tibialis Raise (Wall Sit)',
    category: 'legs', equipment: 'bodyweight',
    primary: ['tibialis'], secondary: [],
    curve: 'partial',
    curveNote: 'Dorsiflexion against gravity or band trains tibialis anterior — vastly neglected muscle. Directly opposes calf, critical for anterior knee stability, shin splint prevention, and ankle dorsiflexion in squats.',
    form: ['Back against wall, feet forward', 'Raise toes as high as possible', 'Lower with control', 'Add ankle weights or band for progression'],
    lesserKnown: true
  },
  {
    id: 'tibialis-anterior-sled',
    name: 'Tibialis Raise (ATG Sled Push)',
    category: 'legs', equipment: 'machine',
    primary: ['tibialis'], secondary: ['calves', 'quads'],
    curve: 'matching',
    curveNote: 'Walking backward pushing sled is the gold standard for tibialis loading — progressive and scalable. Pioneered in ATG system for knee rehab and patellar tendon strengthening.',
    form: ['Sled behind you, pull rope or push handles', 'Walk backward, leading with heels', 'Toe-up style on each step', 'Start very light — tibialis is undertrained in most people'],
    lesserKnown: true,
  },
  {
    id: 'donkey-calf-raise',
    name: 'Donkey Calf Raise',
    category: 'legs', equipment: 'bodyweight',
    primary: ['calves'], secondary: [],
    curve: 'matching',
    curveNote: 'Hip-hinge position with weight on lower back lengthens gastrocnemius at hip while loading it — creates unique tension that cannot be replicated standing. Old-school bodybuilder staple for calf mass.',
    form: ['Hinge at hips 90°, partner or weight on low back', 'Full stretch at bottom', 'Full plantarflexion at top', 'Slow eccentric'],
    lesserKnown: true
  },

  // ── ADDUCTORS / ABDUCTORS ────────────────────────────────────────────────────
  {
    id: 'copenhagen-adduction',
    name: 'Copenhagen Adduction',
    category: 'legs', equipment: 'bodyweight',
    primary: ['adductors'], secondary: ['core', 'glutes'],
    curve: 'partial',
    curveNote: 'Side plank with inner thigh resting on bench — lifting lower leg uses adductor force. One of the highest adductor loading exercises. Strong evidence for groin injury prevention in field sports.',
    form: ['Top foot on bench in side plank position', 'Lift lower leg to touch bench', 'Keep hips stacked', 'Progress from short lever (knees) to long lever (feet)'],
    lesserKnown: true
  },
  {
    id: 'adductor-machine',
    name: 'Adductor Machine',
    category: 'legs', equipment: 'machine',
    primary: ['adductors'], secondary: [],
    curve: 'matching',
    curveNote: 'Machine provides consistent resistance through hip adduction arc. Most accessible adductor isolation exercise — allows high load without balance demand.',
    form: ['Full ROM — thighs apart at start', 'Squeeze thighs together', 'Control the return — eccentric is key for groin health', 'Slow down on the opening'],
    lesserKnown: false
  },
  {
    id: 'cable-hip-adduction',
    name: 'Cable Hip Adduction',
    category: 'legs', equipment: 'cable',
    primary: ['adductors'], secondary: [],
    curve: 'matching',
    curveNote: 'Side-standing with low cable provides constant tension through adduction arc. More natural movement path than machine — can be done unilaterally with full step control.',
    form: ['Ankle cuff on low cable, standing sideways', 'Draw working leg across body', 'Control return to starting position', 'Keep torso upright throughout'],
    lesserKnown: false
  },
  {
    id: 'abductor-machine',
    name: 'Abductor Machine',
    category: 'legs', equipment: 'machine',
    primary: ['abductors', 'glutes'], secondary: [],
    curve: 'matching',
    curveNote: 'Machine isolates glute medius and TFL through hip abduction arc with consistent loading. High reps work well here due to muscle fiber composition of hip abductors.',
    form: ['Full ROM — start with legs together', 'Push knees apart, squeeze glutes', 'Control the return', 'Slow eccentric for better engagement'],
    lesserKnown: false
  },

  // ── CORE ─────────────────────────────────────────────────────────────────────
  {
    id: 'ab-wheel-rollout',
    name: 'Ab Wheel Rollout',
    category: 'core', equipment: 'bodyweight',
    primary: ['abs', 'transverse-abs'], secondary: ['lats', 'erectors', 'shoulders'],
    curve: 'matching',
    curveNote: 'Resistance increases as wheel rolls out — maximum load at full extension where anti-extension demand is highest. Perfect loading curve for core anti-extension strength.',
    form: ['From knees initially — full rollout is very advanced', 'Keep hips slightly tucked — do not hyperextend lumbar', 'Pull in with abs to return — not shoulders', 'Full extension only when truly strong'],
    lesserKnown: false
  },
  {
    id: 'cable-crunch',
    name: 'Cable Crunch',
    category: 'core', equipment: 'cable',
    primary: ['abs'], secondary: ['obliques'],
    curve: 'matching',
    curveNote: 'High pulley provides consistent resistance through the flexion arc — unlike crunches where resistance is zero at the top. Can be loaded progressively unlike most bodyweight ab work.',
    form: ['Kneel with rope at sides of head', 'Crunch toward floor — not just pulling rope down', 'Round the spine — this is spinal flexion, not hip flexion', 'Return slowly'],
    lesserKnown: false
  },
  {
    id: 'hanging-leg-raise',
    name: 'Hanging Leg Raise',
    category: 'core', equipment: 'bodyweight',
    primary: ['abs', 'hip-flexors'], secondary: ['obliques'],
    curve: 'partial',
    curveNote: 'Hanging position removes ground support — abs and hip flexors must control the full weight of legs. High hip-flexor involvement; ensure posterior pelvic tilt to engage abs over hip flexors.',
    form: ['Dead hang start', 'Posterior tilt pelvis before raising', 'Raise legs to parallel or higher', 'Lower with control — no swinging'],
    lesserKnown: false
  },
  {
    id: 'pallof-press',
    name: 'Pallof Press',
    category: 'core', equipment: 'cable',
    primary: ['transverse-abs', 'obliques'], secondary: ['abs', 'glutes'],
    curve: 'matching',
    curveNote: 'Anti-rotation exercise — cable pulling laterally at all times demands core resist rotation throughout the press. Maximum resistance at full extension where rotary demand is highest.',
    form: ['Stand perpendicular to cable', 'Press handle straight out from sternum', 'Hold briefly at full extension', 'Return without rotating'],
    lesserKnown: false
  },
  {
    id: 'dead-bug',
    name: 'Dead Bug',
    category: 'core', equipment: 'bodyweight',
    primary: ['transverse-abs', 'abs'], secondary: ['hip-flexors'],
    curve: 'partial',
    curveNote: 'Contralateral limb lowering with maintained lumbar pressure builds anti-extension and motor control. One of the safest and most effective core stability exercises — key in rehab and prehab.',
    form: ['Lower back pressed into floor throughout', 'Lower opposite arm and leg simultaneously', 'Do not let back arch off floor', 'Breathe out on the descent'],
    lesserKnown: false
  },
  {
    id: 'dragon-flag',
    name: 'Dragon Flag',
    category: 'core', equipment: 'bodyweight',
    primary: ['abs', 'transverse-abs'], secondary: ['erectors', 'hip-flexors', 'lats'],
    curve: 'matching',
    curveNote: 'Full body lever from a bench — entire body acts as a plank lowering toward horizontal. Enormous anti-extension demand on abs. One of the hardest bodyweight core exercises.',
    form: ['Hold bench behind head for support', 'Keep body rigid — do not pike at hips', 'Lower slowly toward horizontal', 'Return by driving hips up, not bending'],
    lesserKnown: false
  },
  {
    id: 'plank',
    name: 'Plank (Front)',
    category: 'core', equipment: 'bodyweight',
    primary: ['transverse-abs', 'abs'], secondary: ['glutes', 'shoulders', 'erectors'],
    curve: 'partial',
    curveNote: 'Isometric anti-extension hold. Gravity loads at consistent level throughout hold. Best used for endurance-focused core work or as a foundation for more complex movements.',
    form: ['Forearms on floor, body rigid', 'Do not let hips sag or pike', 'Squeeze glutes and brace abs simultaneously', '30–60 second holds for most purposes'],
    lesserKnown: false
  },
  {
    id: 'side-plank',
    name: 'Side Plank',
    category: 'core', equipment: 'bodyweight',
    primary: ['obliques', 'transverse-abs'], secondary: ['glutes', 'abductors'],
    curve: 'partial',
    curveNote: 'Anti-lateral flexion isometric. One of the strongest lateral core loading methods. Can be progressed with hip dips or raised leg.',
    form: ['Elbow directly under shoulder', 'Body in straight line from head to feet', 'Top hip stacked over bottom hip', 'Do not let hips sag'],
    lesserKnown: false
  },
  {
    id: 'landmine-rotation',
    name: 'Landmine Rotation',
    category: 'core', equipment: 'barbell',
    primary: ['obliques'], secondary: ['shoulders', 'transverse-abs'],
    curve: 'partial',
    curveNote: 'Arc rotation against barbell weight loads obliques through rotational ROM. One of few weighted exercises that trains rotation rather than resisting it.',
    form: ['Hold bar at arms length, arc side to side', 'Hips stay square — rotation from thorax', 'Control each end of the arc', 'Light weight — this is rotation, not a press'],
    lesserKnown: false
  },
  {
    id: 'suitcase-carry',
    name: 'Suitcase Carry',
    category: 'core', equipment: 'dumbbell',
    primary: ['obliques', 'transverse-abs'], secondary: ['glutes', 'forearms', 'traps'],
    curve: 'partial',
    curveNote: 'Unilateral loaded carry creates lateral flexion demand on core throughout each step. Functional anti-lateral flexion and gait stability — one of the most transferable core exercises.',
    form: ['Heavy dumbbell in one hand at side', 'Resist lateral lean — stand tall', 'Walk with normal gait', 'Switch hands each set or halfway through'],
    lesserKnown: false
  },
  {
    id: 'roman-chair-sit-up',
    name: 'Roman Chair Sit-Up',
    category: 'core', equipment: 'machine',
    primary: ['abs', 'hip-flexors'], secondary: ['obliques'],
    curve: 'matching',
    curveNote: 'Hyperextended start position puts abs on maximum stretch; gravity provides strong resistance through the full flexion ROM. Can be loaded with plate on chest for progression.',
    form: ['Feet hooked in pads at hip height', 'Hands on chest or behind head', 'Extend back below horizontal at bottom for stretch', 'Rise only to slightly past parallel — not vertical'],
    lesserKnown: false
  },
  {
    id: 'hollow-body-hold',
    name: 'Hollow Body Hold',
    category: 'core', equipment: 'bodyweight',
    primary: ['abs', 'transverse-abs'], secondary: ['hip-flexors'],
    curve: 'partial',
    curveNote: 'Full body anti-extension isometric with arms and legs extended. Foundation of gymnastic strength training. High demand on TVA and rectus to maintain lumbar contact with floor.',
    form: ['Lower back pressed into floor throughout', 'Arms overhead, legs extended low', 'Raise shoulders off floor slightly', 'Do not let lower back arch'],
    lesserKnown: false
  },
  // ── ADDITIONAL CHEST ─────────────────────────────────────────────────────────
  {
    id: 'incline-cable-fly',
    name: 'Incline Cable Fly',
    category: 'push', equipment: 'cable',
    primary: ['chest'], secondary: ['front-delt'],
    curve: 'matching',
    curveNote: 'Low pulleys angled up to incline bench position — tension maintained throughout upper chest arc from stretch to contraction. Beats incline dumbbell fly for consistent loading.',
    form: ['Cables set at floor level, bench at 30–45°', 'Arc dumbbells / cables up and together', 'Squeeze chest at top', 'Slow controlled descent with full stretch'],
    lesserKnown: false
  },
  {
    id: 'dips-weighted',
    name: 'Weighted Dips (Chest)',
    category: 'push', equipment: 'bodyweight',
    primary: ['chest', 'triceps'], secondary: ['front-delt'],
    curve: 'partial',
    curveNote: 'Added belt weight increases loading beyond bodyweight limit. Lean forward maintains chest over tricep emphasis. One of the best upper body mass builders.',
    form: ['Weight belt with plate or chain', 'Lean forward 20–30°', 'Full depth — slight stretch at shoulder', 'Full extension at top'],
    lesserKnown: false
  },
  {
    id: 'push-up-ring',
    name: 'Ring Push-Up',
    category: 'push', equipment: 'bodyweight',
    primary: ['chest', 'triceps'], secondary: ['serratus', 'core'],
    curve: 'partial',
    curveNote: 'Rings allow wrist rotation and increase instability — additional serratus and rotator cuff demand vs floor push-ups. Greater ROM possible at the bottom.',
    form: ['Rings close to floor', 'Allow natural wrist rotation as you press', 'Full ROM at bottom', 'Rings can be lowered to increase difficulty'],
    lesserKnown: false
  },
  {
    id: 'cable-single-arm-press',
    name: 'Single-Arm Cable Press',
    category: 'push', equipment: 'cable',
    primary: ['chest', 'front-delt'], secondary: ['triceps', 'core'],
    curve: 'partial',
    curveNote: 'Unilateral pressing reveals imbalances and adds rotational core demand. Cable keeps tension consistent; single arm allows greater chest stretch at start position.',
    form: ['Stagger stance, cable behind at shoulder height', 'Press across body with slight horizontal adduction', 'Brace core against rotation', 'Full extension and squeeze'],
    lesserKnown: false
  },

  // ── ADDITIONAL BACK ──────────────────────────────────────────────────────────
  {
    id: 'single-arm-landmine-row',
    name: 'Single-Arm Landmine Row',
    category: 'pull', equipment: 'barbell',
    primary: ['lats', 'rhomboids'], secondary: ['biceps', 'rear-delt'],
    curve: 'matching',
    curveNote: 'Landmine angle creates unique arc that allows elbow to travel behind torso — full lat contraction at peak. Foot-supported version allows heavier loading than dumbbell rows.',
    form: ['Brace contralateral knee and hand', 'Drive elbow behind torso', 'Full lat stretch at bottom', 'Do not rotate at top'],
    lesserKnown: false
  },
  {
    id: 'cable-row-single-arm-standing',
    name: 'Standing Single-Arm Cable Row',
    category: 'pull', equipment: 'cable',
    primary: ['lats', 'rhomboids'], secondary: ['biceps', 'core'],
    curve: 'matching',
    curveNote: 'Standing position adds anti-rotation core demand. Cable tension consistent; elbow can travel past hip for fuller lat contraction than seated versions.',
    form: ['Stand facing cable, slight lean forward', 'Drive elbow back past hip', 'Allow shoulder to reach forward at start', 'Resist trunk rotation throughout'],
    lesserKnown: false
  },
  {
    id: 'bent-over-dumbbell-row',
    name: 'Bent-Over Dumbbell Row (Bilateral)',
    category: 'pull', equipment: 'dumbbell',
    primary: ['lats', 'rhomboids', 'mid-traps'], secondary: ['biceps', 'erectors'],
    curve: 'partial',
    curveNote: 'Bilateral version allows more total load than unilateral but requires stronger erector endurance. More balanced loading than barbell due to independent arm movement.',
    form: ['Hinge to 45–70° torso angle', 'Both dumbbells pulled simultaneously', 'Elbows back, not flared out', 'Hold at top, full stretch at bottom'],
    lesserKnown: false
  },
  {
    id: 'shrug-barbell',
    name: 'Barbell Shrug',
    category: 'pull', equipment: 'barbell',
    primary: ['traps'], secondary: ['rhomboids', 'forearms'],
    curve: 'partial',
    curveNote: 'Gravity provides load through scapular elevation arc. Peak resistance at mid-shrug; shortens as traps reach full contraction. Heavy loading possible — key trap mass builder.',
    form: ['Straight up — not circular', 'Hold at top for 1 second', 'Full depression between reps for ROM', 'Use straps at high loads'],
    lesserKnown: false
  },
  {
    id: 'shrug-dumbbell',
    name: 'Dumbbell Shrug',
    category: 'pull', equipment: 'dumbbell',
    primary: ['traps'], secondary: ['rhomboids'],
    curve: 'partial',
    curveNote: 'Same profile as barbell shrug; dumbbells sit at sides allowing slightly more ROM and independent arm movement. Easier to progress incrementally.',
    form: ['Hold at sides, straight up shrug', 'Full elevation at top, full depression at bottom', 'No rolling — just pure elevation', 'Control the descent'],
    lesserKnown: false
  },
  {
    id: 'cable-shrug',
    name: 'Cable Shrug',
    category: 'pull', equipment: 'cable',
    primary: ['traps'], secondary: [],
    curve: 'matching',
    curveNote: 'Low pulley maintains tension through the full elevation arc, unlike barbells where the load angle changes. More consistent trap loading from bottom to top.',
    form: ['Low pulley, straight bar', 'Stand upright, arms straight', 'Elevate scapulae straight up', 'Full depression between reps'],
    lesserKnown: false
  },

  // ── ADDITIONAL SHOULDERS ─────────────────────────────────────────────────────
  {
    id: 'seated-dumbbell-press',
    name: 'Seated Dumbbell Overhead Press',
    category: 'shoulders', equipment: 'dumbbell',
    primary: ['front-delt', 'mid-delt'], secondary: ['triceps', 'rotator-cuff'],
    curve: 'partial',
    curveNote: 'Seated position removes leg drive variable — more strict shoulder stimulus. Same resistance profile as standing; backrest can assist for heavier loading.',
    form: ['90° back support or slight recline', 'Dumbbells at ear height to start', 'Press directly overhead', 'Do not arch lower back excessively'],
    lesserKnown: false
  },
  {
    id: 'pike-push-up',
    name: 'Pike Push-Up',
    category: 'shoulders', equipment: 'bodyweight',
    primary: ['front-delt', 'mid-delt'], secondary: ['triceps'],
    curve: 'partial',
    curveNote: 'Hips raised high creates vertical pressing angle similar to overhead press. Good bodyweight shoulder builder. Progress to wall-supported handstand push-up for more stimulus.',
    form: ['Hips high, body inverted V shape', 'Head lowers toward floor between hands', 'Extend arms fully', 'Controlled descent — shoulder strength exercise'],
    lesserKnown: false
  },
  {
    id: 'handstand-push-up',
    name: 'Handstand Push-Up (Wall)',
    category: 'shoulders', equipment: 'bodyweight',
    primary: ['front-delt', 'mid-delt'], secondary: ['triceps', 'core'],
    curve: 'partial',
    curveNote: 'Full bodyweight load on shoulders in truly vertical pressing position. Highest front-delt bodyweight stimulus possible. Extremely difficult — only for advanced trainees.',
    form: ['Kick up to wall, body straight', 'Lower head to floor between hands', 'Push to full extension', 'Head to floor is the standard rep'],
    lesserKnown: false
  },
  {
    id: 'single-arm-lateral-raise',
    name: 'Single-Arm Cable Lateral Raise',
    category: 'shoulders', equipment: 'cable',
    primary: ['mid-delt'], secondary: ['rotator-cuff'],
    curve: 'matching',
    curveNote: 'Unilateral cable lateral raise from low pulley on opposite side. Cable maintains tension throughout full abduction arc from 0° to 90° — superior to dumbbell at lower angles.',
    form: ['Low cable on opposite side of body', 'Cross cable in front', 'Raise to just above shoulder height', 'Slow eccentric with cable resistance'],
    lesserKnown: false
  },
  {
    id: 'incline-y-raise',
    name: 'Incline Y-Raise (Dumbbell)',
    category: 'shoulders', equipment: 'dumbbell',
    primary: ['lower-traps', 'rear-delt', 'mid-traps'], secondary: ['rotator-cuff'],
    curve: 'opposing',
    curveNote: 'Prone on incline bench with arms extending in Y. Loads rear delt and lower trap through diagonal raise. Gravity is moderate — works through mid-range but not at top.',
    form: ['Prone on 30–45° incline', 'Raise arms at 135° angle from torso (Y shape)', 'Thumbs up throughout', 'Light weight — these muscles are weak'],
    lesserKnown: true
  },
  {
    id: 'external-rotation-cable',
    name: 'External Rotation (Cable)',
    category: 'shoulders', equipment: 'cable',
    primary: ['rotator-cuff'], secondary: ['rear-delt'],
    curve: 'matching',
    curveNote: 'Cable lateral provides consistent resistance through external rotation arc — better than dumbbell which provides zero resistance at start. Infraspinatus and teres minor isolation.',
    form: ['Elbow at 90°, pinned to side', 'Rotate forearm outward against cable', 'Keep upper arm stationary', 'Light weight — this is structural health work'],
    lesserKnown: true
  },
  {
    id: 'internal-rotation-cable',
    name: 'Internal Rotation (Cable)',
    category: 'shoulders', equipment: 'cable',
    primary: ['rotator-cuff'], secondary: ['front-delt'],
    curve: 'matching',
    curveNote: 'Cable provides consistent resistance through internal rotation arc. Subscapularis isolation — the most powerful internal rotator and critical scapular stabiliser.',
    form: ['Elbow at 90°, pinned to side', 'Rotate forearm inward against cable', 'Keep upper arm still', 'Balance with external rotation work'],
    lesserKnown: true
  },
  {
    id: 'landmine-lateral-raise',
    name: 'Landmine Lateral Raise',
    category: 'shoulders', equipment: 'barbell',
    primary: ['mid-delt'], secondary: ['front-delt', 'rotator-cuff'],
    curve: 'matching',
    curveNote: 'End of barbell provides unique arc that loads mid-delt with increasing resistance through the raise — unlike dumbbell which has maximum load at lowest point. Shoulder-friendly path.',
    form: ['Hold end of barbell, arm at side', 'Raise in arc — elbow leads', 'Stop at shoulder height', 'Control the descent along the same arc'],
    lesserKnown: true
  },
  {
    id: 'seated-behind-neck-press',
    name: 'Behind-Neck Press (Smith Machine)',
    category: 'shoulders', equipment: 'smith',
    primary: ['mid-delt', 'front-delt'], secondary: ['triceps', 'rotator-cuff'],
    curve: 'partial',
    curveNote: 'Behind-neck position increases mid-delt recruitment by changing bar path. Higher shoulder impingement risk — only appropriate for those with good mobility. Smith machine provides safety.',
    form: ['Head forward, bar behind neck to ear level', 'Elbows wide at 90° before pressing', 'Do not press if shoulder pain occurs', 'Light-moderate weight only'],
    lesserKnown: false
  },

  // ── ADDITIONAL ARMS ──────────────────────────────────────────────────────────
  {
    id: 'cable-curl-high',
    name: 'High Cable Curl',
    category: 'arms', equipment: 'cable',
    primary: ['biceps'], secondary: ['front-delt'],
    curve: 'matching',
    curveNote: 'Cable at head height pulled toward face — bicep shortens against resistance that peaks at peak contraction. Arms in shoulder-flexed position also places long head bicep on length, adding tension.',
    form: ['Stand between two high cables', 'Curl both handles toward temples simultaneously', 'Hold peak squeeze', 'Slow return against cable tension'],
    lesserKnown: true
  },
  {
    id: 'machine-curl',
    name: 'Machine Curl',
    category: 'arms', equipment: 'machine',
    primary: ['biceps'], secondary: ['brachialis'],
    curve: 'partial',
    curveNote: 'Machine cam designed for consistent bicep loading. Removes stabiliser demand — focus entirely on bicep contraction. Seat adjustment critical for correct lever arm.',
    form: ['Elbow on pad at correct height', 'Full extension at bottom', 'Squeeze hard at top', 'Control eccentric — do not let it slam down'],
    lesserKnown: false
  },
  {
    id: 'tricep-pushdown-single-arm',
    name: 'Single-Arm Cable Pushdown',
    category: 'arms', equipment: 'cable',
    primary: ['triceps'], secondary: [],
    curve: 'matching',
    curveNote: 'Unilateral pushdown corrects bilateral strength imbalances. Same cable-at-lockout benefit. D-handle allows slight wrist rotation which can reduce elbow stress.',
    form: ['High cable, D-handle', 'Elbow pinned to side', 'Full extension, squeeze hard', 'Alternate arms or do all sets per side'],
    lesserKnown: false
  },
  {
    id: 'bench-dips',
    name: 'Bench Dips',
    category: 'arms', equipment: 'bodyweight',
    primary: ['triceps'], secondary: ['front-delt'],
    curve: 'partial',
    curveNote: 'Hands on bench behind body, feet on floor or elevated. Bodyweight load at bottom where triceps are stretched. Shoulder-forward position can cause impingement at high volumes.',
    form: ['Hands on bench, fingers forward', 'Lower until arms at 90°', 'Do not go too deep — shoulder safety', 'Straighten legs for more difficulty'],
    lesserKnown: false
  },
  {
    id: 'reverse-grip-pushdown',
    name: 'Reverse Grip Pushdown',
    category: 'arms', equipment: 'cable',
    primary: ['triceps'], secondary: ['brachioradialis'],
    curve: 'matching',
    curveNote: 'Supinated grip on pushdown shifts emphasis to medial head of tricep and adds brachioradialis. Full lockout still loads tricep at its strongest — same cable benefit at end range.',
    form: ['Supinated (palms up) grip on bar', 'Elbows at sides', 'Extend fully — medial head fires hard here', 'Control the return'],
    lesserKnown: true
  },
  {
    id: 'wrist-curl-barbell',
    name: 'Wrist Curl (Barbell)',
    category: 'arms', equipment: 'barbell',
    primary: ['forearms'], secondary: [],
    curve: 'matching',
    curveNote: 'Seated with forearms on thighs, wrist extension loaded by gravity. Direct wrist flexor development — important for grip strength and elbow stability.',
    form: ['Forearms on thighs, wrists over edge', 'Full extension at bottom', 'Curl wrists up through full ROM', 'High reps — forearms are endurance muscles'],
    lesserKnown: false
  },
  {
    id: 'reverse-wrist-curl',
    name: 'Reverse Wrist Curl',
    category: 'arms', equipment: 'barbell',
    primary: ['forearms'], secondary: [],
    curve: 'matching',
    curveNote: 'Pronated forearm on thigh — trains wrist extensors. Balances wrist flexor strength; critical for lateral epicondyle (tennis elbow) prevention and overall forearm development.',
    form: ['Pronated grip, forearms on thighs', 'Wrists hang at bottom', 'Raise wrists up against gravity', 'Lighter than flexor curls — extensors are weaker'],
    lesserKnown: false
  },
  {
    id: 'farmers-carry',
    name: 'Farmer\'s Carry',
    category: 'arms', equipment: 'dumbbell',
    primary: ['forearms', 'traps'], secondary: ['core', 'glutes', 'calves'],
    curve: 'partial',
    curveNote: 'Heavy load carried for distance or time — grip, trap, and entire kinetic chain loaded isometrically. Functional strength builder with massive carryover to all pulling movements.',
    form: ['Heavy dumbbells or trap bar', 'Stand tall — do not lean', 'Walk with controlled steps', 'Grip hard — forearm fatigue is the point'],
    lesserKnown: false
  },

  // ── ADDITIONAL LEGS ──────────────────────────────────────────────────────────
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    category: 'legs', equipment: 'dumbbell',
    primary: ['quads', 'glutes'], secondary: ['adductors', 'core'],
    curve: 'partial',
    curveNote: 'Front-loaded counterbalance naturally creates upright torso — excellent quad recruitment. Great teaching tool for squat mechanics; loaded with kettlebell or dumbbell.',
    form: ['Hold weight at chest level', 'Elbows inside knees at bottom', 'Full depth — goblet position aids mobility', 'Drive knees out throughout'],
    lesserKnown: false
  },
  {
    id: 'box-squat',
    name: 'Box Squat',
    category: 'legs', equipment: 'barbell',
    primary: ['quads', 'glutes', 'hamstrings'], secondary: ['erectors', 'adductors'],
    curve: 'partial',
    curveNote: 'Sitting to box forces elimination of bounce and demands concentric-only strength from the bottom. Develops posterior chain engagement at the transition point. Powerlifter staple.',
    form: ['Box height at or slightly above parallel', 'Sit back to box, do not crash', 'Full hip crease at bottom', 'Drive through floor explosively'],
    lesserKnown: false
  },
  {
    id: 'pause-squat',
    name: 'Pause Squat',
    category: 'legs', equipment: 'barbell',
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'erectors'],
    curve: 'partial',
    curveNote: 'Pausing in the hole removes elastic energy — requires true muscular strength to rise. Develops strength at the weakest point of the squat for most lifters.',
    form: ['Full depth, pause for 2–3 seconds', 'Stay tight throughout the pause', 'No bounce — dead stop', 'Lighter than regular squat — that is the point'],
    lesserKnown: false
  },
  {
    id: 'safety-bar-squat',
    name: 'Safety Bar Squat',
    category: 'legs', equipment: 'barbell',
    primary: ['quads', 'glutes'], secondary: ['erectors', 'hamstrings'],
    curve: 'partial',
    curveNote: 'Cambered safety bar positions load forward of back squat, creating more upright torso. Reduces shoulder and wrist stress. Good for those with mobility restrictions.',
    form: ['Handles forward, bar on trap pads', 'More upright torso than back squat', 'Full depth', 'Good squat depth cue: sit between legs'],
    lesserKnown: false
  },
  {
    id: 'curtsy-lunge',
    name: 'Curtsy Lunge',
    category: 'legs', equipment: 'dumbbell',
    primary: ['glutes', 'quads', 'adductors'], secondary: ['hamstrings'],
    curve: 'partial',
    curveNote: 'Rear foot steps diagonally behind front leg — creates unique adductor and glute medius loading angle. Trains hip abductor eccentrically while glute fires concentrically.',
    form: ['Step rear foot behind and to opposite side', 'Lower knee toward floor', 'Keep chest up', 'Return to starting position — repeat'],
    lesserKnown: false
  },
  {
    id: 'hip-abduction-cable',
    name: 'Cable Hip Abduction',
    category: 'legs', equipment: 'cable',
    primary: ['abductors', 'glutes'], secondary: [],
    curve: 'matching',
    curveNote: 'Low cable from inner ankle provides consistent tension through abduction arc — better than machine for standing functional carryover. Glute medius primary mover.',
    form: ['Ankle cuff, cable from inner side', 'Stand on one leg, raise other laterally', 'Control the return — eccentric is key', 'Do not lean to compensate'],
    lesserKnown: false
  },
  {
    id: 'standing-leg-curl',
    name: 'Standing Leg Curl (Machine)',
    category: 'legs', equipment: 'machine',
    primary: ['hamstrings'], secondary: ['calves'],
    curve: 'partial',
    curveNote: 'Single-leg version reveals asymmetries. Hip in neutral position provides different hamstring loading angle to lying and seated versions — good for complete hamstring development.',
    form: ['Single leg, pad above ankle', 'Curl to full flexion', 'Do not kick — controlled', 'Full extension between reps'],
    lesserKnown: false
  },
  {
    id: 'sumo-squat',
    name: 'Sumo Squat (Dumbbell)',
    category: 'legs', equipment: 'dumbbell',
    primary: ['adductors', 'glutes', 'quads'], secondary: ['hamstrings'],
    curve: 'partial',
    curveNote: 'Wide stance targets adductors and inner thigh heavily. Dumbbell held between legs. Good for glute and inner thigh development with minimal equipment.',
    form: ['Wide stance, toes out 30–45°', 'Dumbbell hangs between legs', 'Knees track toes throughout', 'Full depth — inner thigh stretch at bottom'],
    lesserKnown: false
  },
  {
    id: 'jump-squat',
    name: 'Jump Squat',
    category: 'legs', equipment: 'bodyweight',
    primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings'],
    curve: 'matching',
    curveNote: 'Explosive concentric — trains rate of force development in quads and glutes. Power output demand means high neural activation. Peak power at take-off aligns with muscle output.',
    form: ['Squat to parallel', 'Explode upward — maximum height', 'Soft landing — absorb with knees', 'Reset fully before next rep for power training'],
    lesserKnown: false
  },

  // ── ADDITIONAL CORE ──────────────────────────────────────────────────────────
  {
    id: 'weighted-crunch',
    name: 'Weighted Crunch',
    category: 'core', equipment: 'bodyweight',
    primary: ['abs'], secondary: [],
    curve: 'partial',
    curveNote: 'Plate on chest adds resistance to spinal flexion. Gravity loads abs in the mid-range — less at top and bottom. Best for rectus abdominis hypertrophy with progressive overload.',
    form: ['Plate on chest or behind head', 'Curl shoulders off floor — only partial ROM needed', 'Exhale at top', 'Do not pull on neck'],
    lesserKnown: false
  },
  {
    id: 'russian-twist',
    name: 'Russian Twist',
    category: 'core', equipment: 'bodyweight',
    primary: ['obliques'], secondary: ['abs', 'hip-flexors'],
    curve: 'partial',
    curveNote: 'Rotational crunch in V-sit position. Obliques loaded through rotation arc. Plate or medicine ball adds resistance. Hip flexor contribution can be high — brace core to resist.',
    form: ['Feet off floor, leaned back 45°', 'Rotate side to side touching floor', 'Add weight for progression', 'Keep spine in neutral — do not round excessively'],
    lesserKnown: false
  },
  {
    id: 'bicycle-crunch',
    name: 'Bicycle Crunch',
    category: 'core', equipment: 'bodyweight',
    primary: ['obliques', 'abs'], secondary: ['hip-flexors'],
    curve: 'partial',
    curveNote: 'Alternating knee-to-elbow crunch with rotation. High oblique activation in EMG studies — rotation combined with flexion creates strong oblique demand.',
    form: ['Opposite elbow to opposite knee', 'Extend other leg simultaneously', 'Slow and controlled — not speed', 'Keep lower back on floor throughout'],
    lesserKnown: false
  },
  {
    id: 'plank-shoulder-tap',
    name: 'Plank Shoulder Tap',
    category: 'core', equipment: 'bodyweight',
    primary: ['transverse-abs', 'core'], secondary: ['shoulders', 'glutes'],
    curve: 'partial',
    curveNote: 'Anti-rotation demand added to standard plank by lifting one hand to opposite shoulder. Forces lateral stability from TVA and glutes. More challenging than standard plank.',
    form: ['Standard push-up position', 'Touch opposite shoulder while resisting rotation', 'Feet slightly wider than normal for stability', 'Hips stay perfectly level throughout'],
    lesserKnown: false
  },
  {
    id: 'leg-raise-lying',
    name: 'Lying Leg Raise',
    category: 'core', equipment: 'bodyweight',
    primary: ['abs', 'hip-flexors'], secondary: ['transverse-abs'],
    curve: 'matching',
    curveNote: 'Raising straight legs from floor — maximum resistance at start (longest moment arm), decreasing as legs rise. Lower abs and hip flexors heavily recruited. One of the best lower ab exercises.',
    form: ['Hands under glutes for support', 'Keep legs straight', 'Lower under control — do not crash to floor', 'Posterior tilt to engage abs over hip flexors'],
    lesserKnown: false
  },
  {
    id: 'v-up',
    name: 'V-Up',
    category: 'core', equipment: 'bodyweight',
    primary: ['abs', 'hip-flexors'], secondary: ['obliques'],
    curve: 'partial',
    curveNote: 'Simultaneously raises legs and upper body to meet — full rectus abdominis contraction from both ends. High coordination demand. Very effective for abs hypertrophy.',
    form: ['Start fully flat', 'Raise legs and torso simultaneously', 'Touch hands to feet at top', 'Lower with control — do not crash'],
    lesserKnown: false
  },
  {
    id: 'woodchop-cable',
    name: 'Cable Woodchop',
    category: 'core', equipment: 'cable',
    primary: ['obliques'], secondary: ['transverse-abs', 'shoulders', 'lats'],
    curve: 'matching',
    curveNote: 'High-to-low diagonal cable pull maintains tension through rotational arc — cable keeps load consistent throughout the chop pattern. Best loaded rotational core exercise.',
    form: ['High pulley, rotate across body and down', 'Straight arms throughout', 'Power comes from core rotation, not arms', 'Plant feet — no stepping'],
    lesserKnown: false
  },

  // ── OLYMPIC / POWER ──────────────────────────────────────────────────────────
  {
    id: 'power-clean',
    name: 'Power Clean',
    category: 'hinge', equipment: 'barbell',
    primary: ['glutes', 'hamstrings', 'quads'], secondary: ['traps', 'erectors', 'calves'],
    curve: 'matching',
    curveNote: 'Explosive triple extension of ankle, knee and hip generates power. Peak force production aligns with maximum athletic output — not a hypertrophy tool but unmatched for power development.',
    form: ['Start position like deadlift', 'Pull from floor — controlled first pull', 'Explosive second pull at hip — shrug then catch', 'Catch in partial squat with elbows high'],
    lesserKnown: false
  },
  {
    id: 'hang-clean',
    name: 'Hang Clean',
    category: 'hinge', equipment: 'barbell',
    primary: ['glutes', 'hamstrings'], secondary: ['traps', 'erectors', 'quads'],
    curve: 'matching',
    curveNote: 'Clean from hang (above knee) focuses on the second pull and catch — eliminates first pull complexity. Excellent for hip extension power development.',
    form: ['Bar at mid-thigh, slight hip hinge', 'Explode hips forward — pull high', 'Elbows rotate under quickly', 'Catch in athletic quarter-squat position'],
    lesserKnown: false
  },
  {
    id: 'kettlebell-swing',
    name: 'Kettlebell Swing',
    category: 'hinge', equipment: 'kettlebell',
    primary: ['glutes', 'hamstrings'], secondary: ['erectors', 'core', 'shoulders'],
    curve: 'matching',
    curveNote: 'Hip hinge pattern with ballistic concentric — loads glutes and hamstrings through full extension arc. High eccentric demand on hamstrings during the hinge back. Excellent power-endurance developer.',
    form: ['Hike bell back between legs', 'Explosive hip thrust forward — not a squat', 'Bell floats to chest height from hip drive alone', 'Hinge back — do not squat on the way down'],
    lesserKnown: false
  },
  {
    id: 'trap-bar-deadlift',
    name: 'Trap Bar Deadlift',
    category: 'hinge', equipment: 'barbell',
    primary: ['quads', 'glutes', 'hamstrings'], secondary: ['erectors', 'lats', 'forearms'],
    curve: 'partial',
    curveNote: 'Hexagonal bar centres load on athlete — reduces moment arm to spine vs conventional, allowing more upright torso. More quad involvement than conventional; easier to learn. Excellent total leg developer.',
    form: ['Stand in centre of trap bar', 'More upright torso than conventional — use it', 'Push floor away — it is closer to a squat-deadlift hybrid', 'Full lockout, hips and knees extend simultaneously'],
    lesserKnown: false
  },
  // ── FINAL ADDITIONS ──────────────────────────────────────────────────────────
  { id: 'close-grip-lat-pulldown', name: 'Close-Grip Lat Pulldown', category: 'pull', equipment: 'machine', primary: ['lats', 'biceps'], secondary: ['rhomboids'], curve: 'partial', curveNote: 'Narrow supinated or neutral grip shifts emphasis to lower lats and biceps. Elbow path more vertical — good variation from wide grip.', form: ['V-bar or close attachment', 'Pull to upper chest', 'Full stretch at top', 'Elbows travel close to body'], lesserKnown: false },
  { id: 'rack-row', name: 'Rack Row (Barbell Inverted)', category: 'pull', equipment: 'barbell', primary: ['lats', 'rhomboids', 'biceps'], secondary: ['rear-delt', 'core'], curve: 'partial', curveNote: 'Bodyweight inverted row with barbell in rack. Horizontal pulling pattern with bodyweight load — easier than pull-ups. Chest stays up throughout.', form: ['Bar at hip height in rack', 'Lie under bar, overhand grip', 'Pull chest to bar', 'Body plank-rigid throughout'], lesserKnown: false },
  { id: 'inverted-row', name: 'Inverted Row (TRX/Rings)', category: 'pull', equipment: 'bodyweight', primary: ['lats', 'rhomboids'], secondary: ['biceps', 'rear-delt'], curve: 'partial', curveNote: 'Suspension inverted row allows wrist rotation and increases instability. Greater ROM than bar-based version; adjustable difficulty via body angle.', form: ['Angle body 20–60° from floor', 'Pull chest to handles', 'Full arm extension at bottom', 'Squeeze back hard at top'], lesserKnown: false },
  { id: 'snatch-grip-deadlift', name: 'Snatch-Grip Deadlift', category: 'hinge', equipment: 'barbell', primary: ['hamstrings', 'glutes', 'erectors'], secondary: ['traps', 'lats'], curve: 'partial', curveNote: 'Wide grip lowers starting hip position and increases ROM — more upper back and hamstring demand than conventional. Excellent for posterior chain development.', form: ['Very wide overhand grip — snatch width', 'Lower hips than conventional deadlift', 'Bar close throughout', 'Full lockout'], lesserKnown: false },
  { id: 'deficit-deadlift', name: 'Deficit Deadlift', category: 'hinge', equipment: 'barbell', primary: ['hamstrings', 'glutes', 'erectors'], secondary: ['quads', 'lats'], curve: 'partial', curveNote: 'Standing on plates increases ROM at the bottom — more hip and hamstring demand off the floor. Develops strength where most people are weakest.', form: ['Stand on 2–4 inch plates', 'Same mechanics as conventional', 'Bar still over mid-foot', 'Greatest tension at very bottom — start slow'], lesserKnown: false },
  { id: 'pin-squat', name: 'Pin Squat', category: 'legs', equipment: 'barbell', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'erectors'], curve: 'partial', curveNote: 'Bar rests on safeties at bottom position — dead stop eliminates stretch reflex. Pure starting strength from the hole. Develops weakest part of squat.', form: ['Set pins at bottom of squat', 'Sit under bar, brace, drive up from dead stop', 'No touch-and-go', 'Reset tight each rep'], lesserKnown: true },
  { id: 'zercher-squat', name: 'Zercher Squat', category: 'legs', equipment: 'barbell', primary: ['quads', 'glutes', 'core'], secondary: ['biceps', 'erectors'], curve: 'partial', curveNote: 'Bar held in crook of elbows — forces upright torso and full depth. Unique core and bicep loading alongside quad stimulus. Brutal but effective.', form: ['Bar in elbow crook, arms crossed or hands clasped', 'Very upright torso from bar position', 'Full depth — bar position demands it', 'Start light — arm position limits load'], lesserKnown: true },
  { id: 'landmine-squat', name: 'Landmine Squat', category: 'legs', equipment: 'barbell', primary: ['quads', 'glutes'], secondary: ['core'], curve: 'partial', curveNote: 'Holding end of landmine at chest — counterbalance creates front-squat-like mechanics. Shoulder-friendly alternative to front squat.', form: ['Hold bar end at chest', 'Squat deep — bar assists upright posture', 'Drive through heels', 'Good for those with shoulder issues'], lesserKnown: false },
  { id: 'single-leg-press', name: 'Single-Leg Press', category: 'legs', equipment: 'machine', primary: ['quads', 'glutes'], secondary: ['hamstrings'], curve: 'partial', curveNote: 'Unilateral leg press corrects strength imbalances between legs. Same machine loading as bilateral but doubles effective load on the working leg.', form: ['One foot on platform, centred', 'Full ROM — do not lock out', 'Control descent fully', 'Compare strength between legs'], lesserKnown: false },
  { id: 'calf-raise-leg-press', name: 'Calf Raise on Leg Press', category: 'legs', equipment: 'machine', primary: ['calves'], secondary: [], curve: 'matching', curveNote: 'Leg press allows heavy calf loading with full ROM. Similar to standing calf raise but knee angle slightly different — hits gastrocnemius with full body weight equivalent.', form: ['Feet at bottom edge of platform', 'Full plantarflexion and full dorsiflexion', 'Slow controlled tempo', 'Do not lock knees throughout'], lesserKnown: false },
  { id: 'hip-thrust-smith', name: 'Hip Thrust (Smith Machine)', category: 'hinge', equipment: 'smith', primary: ['glutes'], secondary: ['hamstrings', 'quads'], curve: 'matching', curveNote: 'Smith machine allows fixed horizontal bar path — easier setup and potentially heavier loading than barbell. Same glute-alignment at peak as barbell version.', form: ['Upper back on bench, bar across hips', 'Drive hips to horizontal', 'Squeeze glutes hard at top', 'Use pad for comfort'], lesserKnown: false },
  { id: 'glute-ham-developer-curl', name: 'GHD Sit-Up', category: 'core', equipment: 'machine', primary: ['abs', 'hip-flexors'], secondary: ['glutes', 'hamstrings'], curve: 'matching', curveNote: 'GHD sit-up allows hyperextension at the bottom — full ab stretch followed by full contraction. One of the highest ab loading exercises when full ROM is used.', form: ['Feet in GHD pads', 'Lower back to horizontal or beyond', 'Rise to vertical — do not just partial rep', 'Start conservatively — DOMS is severe'], lesserKnown: true },
  { id: 'incline-bench-leg-raise', name: 'Incline Bench Leg Raise', category: 'core', equipment: 'bodyweight', primary: ['abs', 'hip-flexors'], secondary: [], curve: 'matching', curveNote: 'Decline angle from incline bench adds bodyweight resistance at the top of leg raise — increasing load where hanging leg raises decrease it. Excellent lower ab loaing.', form: ['Grip top of incline bench', 'Legs hang at bottom', 'Raise to 90° or above', 'Lower under control — key part of the exercise'], lesserKnown: false },
  { id: 'stir-the-pot', name: 'Stir the Pot (Ball Plank)', category: 'core', equipment: 'bodyweight', primary: ['transverse-abs', 'obliques'], secondary: ['abs', 'shoulders'], curve: 'partial', curveNote: 'Elbows on stability ball, draw circles — anti-rotation demand extremely high throughout. Higher TVA activation than standard plank due to instability.', form: ['Elbows on ball, body plank', 'Draw small clockwise then counter-clockwise circles', 'Hips completely still — only arms move', 'Small circles first — increase size as strength improves'], lesserKnown: true },
  { id: 'goblet-carry', name: 'Goblet Carry', category: 'core', equipment: 'dumbbell', primary: ['transverse-abs', 'core'], secondary: ['front-delt', 'traps'], curve: 'partial', curveNote: 'Dumbbell at chest level carried for distance — front-loaded carry demands strong TVA engagement and upright posture. Core anti-flexion under load.', form: ['Dumbbell pressed to chest, elbows in', 'Walk tall — do not lean back', 'Core braced throughout', 'Heavier than suitcase carry typically'], lesserKnown: false },
  { id: 'press-pallof', name: 'Half-Kneeling Pallof Press', category: 'core', equipment: 'cable', primary: ['obliques', 'transverse-abs'], secondary: ['glutes', 'hip-flexors'], curve: 'matching', curveNote: 'Kneeling removes leg base of support — forces core and glute to resist rotation and lateral lean simultaneously. More demanding than standing version.', form: ['Kneel on inside knee relative to cable', 'Press handle straight out', 'Resist rotation and lateral lean', 'Keep hips square'], lesserKnown: true },
  { id: 'barbell-rollout-standing', name: 'Standing Ab Rollout', category: 'core', equipment: 'barbell', primary: ['abs', 'transverse-abs'], secondary: ['lats', 'erectors'], curve: 'matching', curveNote: 'Most advanced version of ab rollout — full body extension from standing. Extremely high anti-extension demand. Only appropriate for very advanced trainees.', form: ['Stand upright, bend to grip bar', 'Roll out to horizontal or below', 'Return using abs and lats combined', 'Very few people can do this correctly'], lesserKnown: true },
  { id: 'dumbbell-row-pronated', name: 'Dumbbell Row (Pronated)', category: 'pull', equipment: 'dumbbell', primary: ['lats', 'rhomboids'], secondary: ['rear-delt', 'brachioradialis'], curve: 'partial', curveNote: 'Pronated grip shifts emphasis from biceps to brachioradialis and increases rhomboid/mid-trap recruitment. Varied grip for complete back development.', form: ['Overhand grip on dumbbell', 'Pull to lower ribcage area', 'Elbow more flared than supinated version', 'Control the descent'], lesserKnown: false },
  { id: 'cable-row-wide', name: 'Wide-Grip Cable Row', category: 'pull', equipment: 'cable', primary: ['rhomboids', 'mid-traps', 'rear-delt'], secondary: ['lats', 'biceps'], curve: 'matching', curveNote: 'Wide bar attachment on seated row shifts emphasis to upper back — elbows flare and pull to upper chest. More mid-trap and rhomboid, less lat than close-grip version.', form: ['Wide pronated grip on straight bar', 'Pull to upper chest', 'Elbows flare to 90° at end', 'Squeeze upper back hard'], lesserKnown: false },
  { id: 'chest-supported-row-barbell', name: 'Chest-Supported Barbell Row', category: 'pull', equipment: 'barbell', primary: ['lats', 'rhomboids', 'mid-traps'], secondary: ['biceps'], curve: 'partial', curveNote: 'Chest on incline bench completely removes lower back demand. Honest mid-back loading without erector fatigue limiting the set.', form: ['Prone on incline at 45°', 'Barbell hanging below', 'Pull to sternum level', 'Squeeze rhomboids hard at top'], lesserKnown: false },
  { id: 'seated-overhead-press-smith', name: 'Smith Machine Overhead Press', category: 'shoulders', equipment: 'smith', primary: ['front-delt', 'mid-delt'], secondary: ['triceps'], curve: 'partial', curveNote: 'Fixed path removes stabiliser demand — allows focus on pure deltoid overload. Useful when shoulder injury requires guided movement.', form: ['Set up so bar is in front of face', 'Press to full extension', 'Full ROM — do not short stroke', 'Control descent'], lesserKnown: false },
  { id: 'dumbbell-pullover', name: 'Dumbbell Pullover', category: 'pull', equipment: 'dumbbell', primary: ['lats', 'chest'], secondary: ['teres-major', 'abs'], curve: 'opposing', curveNote: 'Dumbbell overhead — maximum load where lats are lengthened (overhead), decreasing as arm returns to chest. Opposite of ideal but unique cross-body lat/chest loader.', form: ['Shoulders on bench, hips off', 'Lower dumbbell behind head', 'Keep slight bend in elbow', 'Return by driving through lats and chest'], lesserKnown: false },
  { id: 'band-pull-apart', name: 'Band Pull-Apart', category: 'pull', equipment: 'bodyweight', primary: ['rear-delt', 'rhomboids', 'mid-traps'], secondary: ['rotator-cuff'], curve: 'matching', curveNote: 'Band maintains resistance through full horizontal abduction — peak load right where rear delt is strongest. One of the best shoulder health exercises with consistent tension profile.', form: ['Hold band at shoulder height, arms straight', 'Pull apart to chest level', 'Squeeze shoulder blades', 'Control return — eccentric is where the benefit is'], lesserKnown: false },
  { id: 'incline-curl', name: 'Incline Bench Curl (Scott Curl)', category: 'arms', equipment: 'dumbbell', primary: ['biceps'], secondary: ['brachialis'], curve: 'partial', curveNote: 'Arms braced on incline — similar to preacher but on incline side. Short head bicep fully loaded; cheating eliminated by bench support.', form: ['Arms over incline, elbows fixed on bench', 'Full extension at bottom', 'Curl to peak', 'Do not bounce at bottom'], lesserKnown: false },
  { id: 'overhead-cable-curl', name: 'Overhead Cable Curl (Double Bicep)', category: 'arms', equipment: 'cable', primary: ['biceps'], secondary: ['front-delt'], curve: 'matching', curveNote: 'Arms extended at shoulder height with high cables — mimics double-bicep pose. Shoulder-flexed position places both bicep heads under tension. Loads peak contraction from an extended position.', form: ['High cables at each side', 'Curl toward temples simultaneously', 'Hold peak flex', 'Return slowly against cable resistance'], lesserKnown: true },
  { id: 'lat-pulldown-behind-neck', name: 'Behind-Neck Lat Pulldown', category: 'pull', equipment: 'machine', primary: ['lats'], secondary: ['rhomboids', 'biceps'], curve: 'partial', curveNote: 'Bar pulled to behind neck increases mid-trap and rhomboid activation at the expense of increased cervical spine load. Only for those with good mobility and no shoulder issues.', form: ['Head forward, bar behind neck', 'Wide grip', 'Touch back of neck lightly — no force', 'Contraindicated for shoulder impingement'], lesserKnown: false },
  { id: 'single-arm-dumbbell-press', name: 'Single-Arm Dumbbell Press', category: 'push', equipment: 'dumbbell', primary: ['chest', 'triceps'], secondary: ['front-delt', 'core', 'serratus'], curve: 'partial', curveNote: 'Unilateral press creates rotational demand on core — anti-rotation adds TVA engagement. Reveals chest imbalances. Core benefit makes this more than just a chest exercise.', form: ['Lay flat, one dumbbell', 'Other arm extended or on chest', 'Press and resist rotation', 'Full ROM as normal press'], lesserKnown: false },
  { id: 'hex-press', name: 'Hex Press (Floor)', category: 'push', equipment: 'dumbbell', primary: ['chest', 'triceps'], secondary: ['front-delt'], curve: 'partial', curveNote: 'Dumbbells pressed together throughout floor press — constant adduction tension from squeezing. Similar to Svend press but in a press pattern. Unusual inner chest loading.', form: ['Flat on floor', 'Hold hex/flat-faced dumbbells pressed together', 'Press without letting them separate', 'Full extension and squeeze at top'], lesserKnown: true },
  { id: 'push-press', name: 'Push Press', category: 'shoulders', equipment: 'barbell', primary: ['front-delt', 'mid-delt', 'triceps'], secondary: ['quads', 'glutes', 'core'], curve: 'matching', curveNote: 'Dip and drive uses leg momentum to initiate the press — allows supramaximal load overhead. True power development in the press pattern. Loads delts through full range with more weight than strict press.', form: ['Small dip then explosive drive', 'Bar goes overhead in one movement', 'Lock out hard at top', 'Reset before each rep or continuous touch-and-go'], lesserKnown: false },
  { id: 'z-press', name: 'Z-Press', category: 'shoulders', equipment: 'barbell', primary: ['front-delt', 'mid-delt'], secondary: ['triceps', 'core', 'hip-flexors'], curve: 'partial', curveNote: 'Seated on floor with legs extended — removes all leg base. Demands extreme core and hip flexor engagement alongside shoulder press. Any cheating is impossible.', form: ['Sit on floor, legs straight', 'Bar in front rack position', 'Press overhead — torso stays upright', 'Very humbling for the load required'], lesserKnown: true },
  { id: 'jefferson-curl', name: 'Jefferson Curl', category: 'hinge', equipment: 'dumbbell', primary: ['erectors', 'hamstrings'], secondary: ['glutes', 'abs'], curve: 'matching', curveNote: 'Deliberate spinal flexion under load — the opposite of most advice, but builds eccentric spinal extensor strength and hamstring flexibility systematically. Very light loads only.', form: ['Start standing tall', 'Curl spine forward one vertebra at a time', 'Hands travel down front of legs to feet', 'Reverse back up segment by segment. VERY light load only'], lesserKnown: true },
  { id: 'dumbbell-deadlift', name: 'Dumbbell Deadlift', category: 'hinge', equipment: 'dumbbell', primary: ['hamstrings', 'glutes', 'erectors'], secondary: ['quads', 'forearms'], curve: 'partial', curveNote: 'Same pattern as conventional deadlift with dumbbells outside legs. Good for learning pattern or when barbell not available. Similar loading curve to trap bar deadlift.', form: ['Dumbbells outside feet', 'Hip hinge — same mechanics as barbell', 'Full lockout at top', 'Dumbbells stay close to body throughout'], lesserKnown: false },
  { id: 'hip-hinge-barbell', name: 'Hip Hinge (Dowel/Barbell Drill)', category: 'hinge', equipment: 'barbell', primary: ['glutes', 'hamstrings'], secondary: ['erectors'], curve: 'partial', curveNote: 'Patterning exercise — barbell held against spine while hinging. Teaches proper neutral spine and hip hinge mechanics. Foundation for all hinge-based exercises.', form: ['Barbell along spine — head, upper back, and tailbone contact', 'Push hips back while maintaining three contact points', 'Knees soft — this is a hinge not a squat', 'Feel hamstring tension as cue for correct position'], lesserKnown: false },
  { id: 'half-kneeling-press', name: 'Half-Kneeling Dumbbell Press', category: 'shoulders', equipment: 'dumbbell', primary: ['front-delt', 'mid-delt'], secondary: ['triceps', 'core', 'glutes'], curve: 'partial', curveNote: 'Single-knee kneeling position adds hip flexor and glute engagement. Anti-lateral flexion demand on core alongside shoulder press. Reveals right-left asymmetries.', form: ['Kneel on one knee, press on same side', 'Opposite glute squeezed hard', 'Brace against lateral lean', 'Press from shoulder to directly overhead'], lesserKnown: false },
  { id: 'cable-face-pull-overhead', name: 'Overhead Cable Face Pull', category: 'shoulders', equipment: 'cable', primary: ['rear-delt', 'rotator-cuff', 'mid-traps'], secondary: ['rhomboids'], curve: 'matching', curveNote: 'Face pull from above-head angle adds upward rotation of scapula to the standard face pull benefits. Serratus and lower trap involvement. Critical for long-term shoulder health under heavy pressing.', form: ['Set cable above head height', 'Pull rope toward face — elbows high', 'External rotate at end', 'Slow and controlled — shoulder health work'], lesserKnown: true },
  { id: 'adductor-squat', name: 'Adductor Squeeze Squat', category: 'legs', equipment: 'bodyweight', primary: ['adductors', 'quads', 'glutes'], secondary: ['hamstrings'], curve: 'partial', curveNote: 'Squeeze a ball or plate between knees during squat — activates adductors throughout squat pattern. Adds inner thigh work to a fundamental movement.', form: ['Ball or folded mat between knees', 'Maintain squeeze through full squat', 'Knees tracked by squeeze — not flaring', 'Standard squat depth'], lesserKnown: true },
];

const EXERCISE_MAP = {};
EXERCISE_DB.forEach(e => { EXERCISE_MAP[e.id] = e; });

module.exports = { EXERCISE_DB, EXERCISE_MAP };
