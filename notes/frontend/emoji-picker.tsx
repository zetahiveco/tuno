import { useMemo, useState } from "react";
import { FiSearch, FiTrash2 } from "react-icons/fi";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

type EmojiEntry = {
  char: string;
  name: string;
  keywords: string[];
};

type EmojiCategory = {
  label: string;
  icon: string;
  emojis: EmojiEntry[];
};

const e = (char: string, name: string, ...keywords: string[]): EmojiEntry => ({ char, keywords, name });

const categories: EmojiCategory[] = [
  {
    label: "Smileys & People",
    icon: "😀",
    emojis: [
      e("😀", "Grinning face", "smile happy grin"),
      e("😃", "Smiling face", "smile happy"),
      e("😄", "Grinning smiling eyes", "smile happy joy"),
      e("😁", "Beaming face", "smile happy grin"),
      e("😆", "Laughing face", "lol laugh"),
      e("😅", "Sweat smile", "relief nervous"),
      e("🤣", "Rolling on the floor", "lol laugh funny"),
      e("😂", "Tears of joy", "lol cry laugh"),
      e("🙂", "Slight smile", "calm"),
      e("😉", "Winking face", "wink flirt"),
      e("😊", "Smiling blushing", "blush warm"),
      e("😇", "Smiling halo", "angel innocent"),
      e("🥰", "Smiling hearts", "love adore"),
      e("😍", "Heart eyes", "love crush"),
      e("🤩", "Star struck", "wow excited"),
      e("😘", "Kiss face", "kiss love"),
      e("😎", "Cool face", "cool sunglasses"),
      e("🤓", "Nerd face", "nerd glasses"),
      e("🧐", "Monocle face", "curious inspect"),
      e("🤔", "Thinking face", "hmm consider"),
      e("🤨", "Raised eyebrow", "skeptical suspicious"),
      e("😐", "Neutral face", "meh"),
      e("😴", "Sleeping face", "sleep tired zzz"),
      e("🤯", "Mind blown", "shock explode"),
      e("🥳", "Partying face", "celebrate party"),
      e("😱", "Screaming face", "fear shock"),
      e("🤗", "Hugging face", "hug"),
      e("🤫", "Shushing face", "quiet secret"),
      e("🤭", "Hand over mouth", "oops giggle"),
      e("🫡", "Saluting face", "salute respect"),
      e("🥲", "Tearing up", "touched sad"),
      e("😭", "Loudly crying", "sad cry sob"),
      e("😤", "Steam from nose", "determined triumph"),
      e("😡", "Enraged face", "angry mad"),
      e("🤝", "Handshake", "deal agreement"),
      e("👍", "Thumbs up", "like approve good"),
      e("👎", "Thumbs down", "dislike bad"),
      e("👏", "Clapping hands", "applause praise"),
      e("🙌", "Raising hands", "celebrate yay"),
      e("🫶", "Heart hands", "love thanks"),
      e("🤟", "Love-you gesture", "love rock"),
      e("✍️", "Writing hand", "write note author"),
      e("💡", "Idea person", "lightbulb"),
      e("🧠", "Brain", "mind smart think"),
    ],
  },
  {
    label: "Animals & Nature",
    icon: "🌱",
    emojis: [
      e("🌱", "Seedling", "grow plant start"),
      e("🌿", "Herb", "leaf nature green"),
      e("🍀", "Four leaf clover", "luck lucky"),
      e("🌳", "Deciduous tree", "tree forest"),
      e("🌲", "Evergreen tree", "pine forest"),
      e("🌴", "Palm tree", "tropical vacation"),
      e("🌵", "Cactus", "desert prickly"),
      e("🌷", "Tulip", "flower spring"),
      e("🌸", "Cherry blossom", "flower sakura"),
      e("🌹", "Rose", "flower love"),
      e("🌻", "Sunflower", "flower sunny"),
      e("🌼", "Blossom", "flower daisy"),
      e("🍃", "Leaf in wind", "leaves flutter"),
      e("🌈", "Rainbow", "colorful pride"),
      e("☀️", "Sun", "sunny warm"),
      e("🌙", "Crescent moon", "night sleep"),
      e("⭐", "Star", "favorite sparkle"),
      e("✨", "Sparkles", "magic shine new"),
      e("⚡", "Lightning", "fast energy zap"),
      e("🔥", "Fire", "flame hot trending"),
      e("💧", "Droplet", "water drop"),
      e("🌊", "Wave", "ocean sea water"),
      e("❄️", "Snowflake", "cold winter"),
      e("🐶", "Dog face", "puppy pet"),
      e("🐱", "Cat face", "kitten pet"),
      e("🐭", "Mouse face", "rodent"),
      e("🐰", "Rabbit face", "bunny hop"),
      e("🦊", "Fox", "clever sly"),
      e("🐻", "Bear", "teddy"),
      e("🐼", "Panda", "bear china"),
      e("🐨", "Koala", "australia"),
      e("🐯", "Tiger face", "wild"),
      e("🦁", "Lion", "brave king"),
      e("🐮", "Cow face", "moo farm"),
      e("🐷", "Pig face", "farm"),
      e("🐸", "Frog", "green jump"),
      e("🐙", "Octopus", "sea eight"),
      e("🦋", "Butterfly", "transform pretty"),
      e("🐝", "Honeybee", "bee busy"),
      e("🐞", "Lady beetle", "ladybug luck"),
      e("🐢", "Turtle", "slow steady"),
      e("🐍", "Snake", "python code"),
      e("🦜", "Parrot", "talk bird"),
      e("🦄", "Unicorn", "magic fantasy"),
      e("🐘", "Elephant", "big memory"),
      e("🦉", "Owl", "wise night"),
    ],
  },
  {
    label: "Food & Drink",
    icon: "🍎",
    emojis: [
      e("🍎", "Red apple", "fruit healthy"),
      e("🍊", "Tangerine", "orange citrus"),
      e("🍋", "Lemon", "citrus sour"),
      e("🍌", "Banana", "fruit"),
      e("🍉", "Watermelon", "fruit summer"),
      e("🍇", "Grapes", "fruit wine"),
      e("🍓", "Strawberry", "fruit berry"),
      e("🫐", "Blueberries", "fruit berry"),
      e("🍒", "Cherries", "fruit"),
      e("🍑", "Peach", "fruit"),
      e("🥭", "Mango", "tropical fruit"),
      e("🍍", "Pineapple", "tropical fruit"),
      e("🥑", "Avocado", "toast healthy"),
      e("🥦", "Broccoli", "vegetable healthy"),
      e("🌽", "Corn", "maize"),
      e("🍞", "Bread", "bakery"),
      e("🥐", "Croissant", "breakfast bakery"),
      e("🥨", "Pretzel", "snack"),
      e("🧀", "Cheese wedge", "dairy"),
      e("🍳", "Cooking", "egg breakfast pan"),
      e("🥞", "Pancakes", "breakfast stack"),
      e("🥓", "Bacon", "breakfast"),
      e("🍔", "Hamburger", "burger fast food"),
      e("🍟", "French fries", "fast food"),
      e("🍕", "Pizza", "slice italian"),
      e("🌮", "Taco", "mexican"),
      e("🌯", "Burrito", "wrap mexican"),
      e("🍜", "Steaming bowl", "ramen noodles"),
      e("🍣", "Sushi", "japanese"),
      e("🍩", "Doughnut", "sweet dessert"),
      e("🍪", "Cookie", "sweet snack"),
      e("🎂", "Birthday cake", "celebrate party"),
      e("🍰", "Shortcake", "cake dessert"),
      e("🍫", "Chocolate bar", "sweet candy"),
      e("🍬", "Candy", "sweet"),
      e("🍿", "Popcorn", "movie snack"),
      e("☕", "Hot beverage", "coffee tea morning"),
      e("🍵", "Tea", "matcha green"),
      e("🧋", "Bubble tea", "boba drink"),
      e("🥤", "Cup with straw", "soda drink"),
      e("🍺", "Beer mug", "drink cheers"),
      e("🍷", "Wine glass", "drink"),
      e("🥂", "Clinking glasses", "celebrate cheers"),
      e("🧊", "Ice cube", "frozen cold"),
    ],
  },
  {
    label: "Activity",
    icon: "⚽",
    emojis: [
      e("⚽", "Soccer ball", "football sport"),
      e("🏀", "Basketball", "sport hoop"),
      e("🏈", "American football", "sport"),
      e("⚾", "Baseball", "sport"),
      e("🎾", "Tennis", "sport racket"),
      e("🏐", "Volleyball", "sport"),
      e("🏓", "Ping pong", "table tennis"),
      e("🏸", "Badminton", "sport racket"),
      e("🥊", "Boxing glove", "fight sport"),
      e("🏆", "Trophy", "win award champion"),
      e("🥇", "First place medal", "gold win"),
      e("🎯", "Direct hit", "target goal bullseye"),
      e("🎮", "Video game", "gaming controller"),
      e("🕹️", "Joystick", "gaming arcade"),
      e("🎲", "Game die", "dice random"),
      e("🧩", "Puzzle piece", "solve jigsaw"),
      e("🎨", "Artist palette", "paint design art"),
      e("🎬", "Clapper board", "movie film"),
      e("🎤", "Microphone", "sing podcast"),
      e("🎧", "Headphone", "music listen"),
      e("🎼", "Musical score", "music notes"),
      e("🎵", "Musical note", "music song"),
      e("🎷", "Saxophone", "jazz music"),
      e("🎸", "Guitar", "music rock"),
      e("🎹", "Musical keyboard", "piano music"),
      e("🥁", "Drum", "beat music"),
      e("🎪", "Circus tent", "show fun"),
      e("🎭", "Performing arts", "theater drama"),
      e("🧗", "Person climbing", "climb adventure"),
      e("🚴", "Person biking", "cycling bike"),
      e("🏊", "Person swimming", "swim"),
      e("🏃", "Person running", "run marathon"),
      e("🏋️", "Person lifting weights", "gym fitness"),
      e("🧘", "Person in lotus", "yoga meditate calm"),
      e("⛰️", "Mountain", "hike climb"),
      e("🏕️", "Camping", "tent outdoors"),
      e("🏄", "Person surfing", "surf wave"),
    ],
  },
  {
    label: "Travel & Places",
    icon: "🚀",
    emojis: [
      e("🚀", "Rocket", "launch ship fast space"),
      e("🛸", "Flying saucer", "ufo alien"),
      e("✈️", "Airplane", "flight travel"),
      e("🚗", "Automobile", "car drive"),
      e("🚕", "Taxi", "cab ride"),
      e("🚌", "Bus", "transit"),
      e("🚆", "Train", "rail travel"),
      e("🚢", "Ship", "boat cruise"),
      e("⛵", "Sailboat", "sailing"),
      e("🗺️", "World map", "travel plan"),
      e("🧭", "Compass", "navigate direction"),
      e("🗽", "Statue of liberty", "new york landmark"),
      e("🗼", "Tokyo tower", "landmark japan"),
      e("🏰", "Castle", "fantasy palace"),
      e("🏯", "Japanese castle", "landmark"),
      e("🎡", "Ferris wheel", "fair amusement"),
      e("🎢", "Roller coaster", "theme park"),
      e("🏖️", "Beach", "vacation sand"),
      e("🏝️", "Desert island", "paradise vacation"),
      e("🏔️", "Snow capped mountain", "peak alps"),
      e("🌋", "Volcano", "lava eruption"),
      e("🏜️", "Desert", "sand dunes"),
      e("🏠", "House", "home building"),
      e("🏢", "Office building", "work city"),
      e("🏥", "Hospital", "health medical"),
      e("🏫", "School", "education learn"),
      e("🏛️", "Classical building", "museum history"),
      e("⛪", "Church", "religion"),
      e("🕌", "Mosque", "religion"),
      e("🛕", "Hindu temple", "religion"),
      e("⛩️", "Shinto shrine", "torii japan"),
      e("🌍", "Globe Europe Africa", "earth world"),
      e("🌎", "Globe Americas", "earth world"),
      e("🌏", "Globe Asia Australia", "earth world"),
      e("🪐", "Ringed planet", "saturn space"),
      e("🌌", "Milky way", "galaxy stars space"),
      e("🔭", "Telescope", "observe space science"),
    ],
  },
  {
    label: "Objects",
    icon: "📚",
    emojis: [
      e("📚", "Books", "library reading study"),
      e("📖", "Open book", "read story"),
      e("📗", "Green book", "book notes"),
      e("📘", "Blue book", "book"),
      e("📙", "Orange book", "book"),
      e("📕", "Closed book", "book read"),
      e("📓", "Notebook", "journal write notes"),
      e("📔", "Notebook with cover", "diary journal"),
      e("📒", "Ledger", "notebook records"),
      e("📃", "Page with curl", "document page"),
      e("📑", "Bookmark tabs", "documents index"),
      e("🔖", "Bookmark", "save mark"),
      e("📄", "Page facing up", "document file page"),
      e("🏷️", "Label", "tag category"),
      e("✏️", "Pencil", "write edit draw"),
      e("🖊️", "Pen", "write sign"),
      e("🖌️", "Paintbrush", "paint art"),
      e("📝", "Memo", "note write todo"),
      e("📁", "File folder", "organize documents"),
      e("📂", "Open folder", "files"),
      e("🗂️", "Card index dividers", "organize"),
      e("📅", "Calendar", "date schedule"),
      e("📆", "Tear-off calendar", "date"),
      e("🗓️", "Spiral calendar", "planner schedule"),
      e("📌", "Pushpin", "pin attach"),
      e("📎", "Paperclip", "attach clip"),
      e("🔗", "Link", "url chain connect"),
      e("💻", "Laptop", "computer code work"),
      e("🖥️", "Desktop computer", "monitor"),
      e("⌨️", "Keyboard", "type typing"),
      e("🖱️", "Computer mouse", "click"),
      e("💾", "Floppy disk", "save storage"),
      e("💿", "Optical disk", "cd disc"),
      e("📷", "Camera", "photo picture"),
      e("📹", "Video camera", "record"),
      e("🎥", "Movie camera", "film video"),
      e("📞", "Telephone receiver", "call phone"),
      e("☎️", "Telephone", "phone call"),
      e("📱", "Mobile phone", "smartphone cell"),
      e("🔋", "Battery", "power energy charge"),
      e("🔌", "Electric plug", "power connect"),
      e("🧪", "Test tube", "science experiment lab"),
      e("🔬", "Microscope", "science research lab"),
      e("🛠️", "Hammer and wrench", "tools fix build"),
      e("🔧", "Wrench", "tool fix"),
      e("🔨", "Hammer", "tool build"),
      e("⚙️", "Gear", "settings config machine"),
      e("🧲", "Magnet", "attract"),
      e("💡", "Light bulb", "idea insight creative"),
      e("🔍", "Magnifying glass", "search find zoom"),
      e("🔎", "Magnifying glass right", "search find"),
      e("🔒", "Locked", "secure private"),
      e("🔑", "Key", "unlock access secret"),
      e("🗝️", "Old key", "unlock"),
      e("🎁", "Gift", "present surprise"),
      e("🎈", "Balloon", "party celebrate"),
      e("🎉", "Party popper", "celebrate confetti launch"),
      e("🎊", "Confetti ball", "party celebrate"),
      e("✉️", "Envelope", "email letter message"),
      e("📩", "Envelope with arrow", "message sent"),
      e("📧", "E-mail", "email inbox"),
      e("📨", "Incoming envelope", "message received"),
      e("📮", "Postbox", "mail send"),
      e("📦", "Package", "box shipping delivery"),
      e("🗑️", "Wastebasket", "trash delete remove"),
      e("💰", "Money bag", "cash finance"),
      e("💳", "Credit card", "payment bank"),
      e("💎", "Gem stone", "diamond precious"),
      e("⏰", "Alarm clock", "time wake reminder"),
      e("⏳", "Hourglass", "time wait"),
      e("⌛", "Hourglass done", "time"),
      e("🕐", "Clock", "time one"),
      e("📊", "Bar chart", "data stats analytics"),
      e("📈", "Chart increasing", "growth growth up trend"),
      e("📉", "Chart decreasing", "down trend"),
      e("📋", "Clipboard", "copy list checklist"),
      e("🗒️", "Spiral notepad", "notes list"),
      e("🧾", "Receipt", "invoice bill"),
      e("🪄", "Magic wand", "magic spell ai"),
      e("🛡️", "Shield", "security protect safe"),
      e("🎯", "Target", "goal aim focus"),
      e("🪙", "Coin", "money token"),
      e("🎙️", "Studio microphone", "record podcast"),
    ],
  },
  {
    label: "Symbols",
    icon: "✅",
    emojis: [
      e("✅", "Check mark button", "done complete yes"),
      e("☑️", "Check box", "checked done"),
      e("✔️", "Check mark", "done complete"),
      e("❌", "Cross mark", "no wrong cancel"),
      e("⭕", "Circle mark", "correct target"),
      e("❗", "Exclamation", "important alert"),
      e("❓", "Question", "ask help quiz"),
      e("⁉️", "Interrobang", "surprise question"),
      e("💯", "Hundred points", "perfect score"),
      e("❤️", "Red heart", "love like"),
      e("🩵", "Light blue heart", "love calm"),
      e("💜", "Purple heart", "love"),
      e("🖤", "Black heart", "dark love"),
      e("🤍", "White heart", "pure love"),
      e("💛", "Yellow heart", "friendship"),
      e("💚", "Green heart", "nature love"),
      e("🧡", "Orange heart", "warmth"),
      e("💔", "Broken heart", "sad breakup"),
      e("💕", "Two hearts", "love couple"),
      e("💖", "Sparkling heart", "love shine"),
      e("🫰", "Hand with fingers crossed heart", "money love"),
      e("♾️", "Infinity", "forever loop"),
      e("♻️", "Recycling", "cycle reuse"),
      e("🔀", "Shuffle", "random mix"),
      e("🔁", "Repeat", "loop again"),
      e("🔔", "Bell", "notification alert reminder"),
      e("🔕", "Bell off", "mute quiet"),
      e("🌟", "Glowing star", "shine special"),
      e("💫", "Dizzy", "sparkle stars"),
      e("☄️", "Comet", "fast space"),
      e("⛅", "Sun behind cloud", "partly cloudy"),
      e("☁️", "Cloud", "weather"),
      e("🌧️", "Cloud with rain", "weather rain"),
      e("⛈️", "Thunderstorm", "storm"),
      e("🌪️", "Tornado", "storm chaos"),
      e("🫧", "Bubbles", "soap clean"),
      e("💬", "Speech balloon", "comment chat talk"),
      e("💭", "Thought balloon", "think idea dream"),
      e("🗯️", "Anger bubble", "shout"),
      e("👁️", "Eye", "watch see view"),
      e("🫵", "Index pointing at viewer", "you point"),
      e("🆗", "OK button", "okay agree"),
      e("🆒", "Cool button", "cool"),
      e("🔝", "Top", "best up"),
      e("🔴", "Red circle", "urgent record"),
      e("🟠", "Orange circle", "medium"),
      e("🟡", "Yellow circle", "pending"),
      e("🟢", "Green circle", "success active"),
      e("🔵", "Blue circle", "info"),
      e("🟣", "Purple circle", "design"),
      e("⚫", "Black circle", "dark"),
      e("⚪", "White circle", "light"),
      e("🟥", "Red square", "urgent"),
      e("🟩", "Green square", "success"),
      e("🟦", "Blue square", "info"),
      e("⬛", "Black square", "dark"),
      e("⬜", "White square", "light"),
      e("🔶", "Large orange diamond", "highlight"),
      e("🔷", "Large blue diamond", "highlight"),
      e("🔸", "Small orange diamond", "bullet"),
      e("🔹", "Small blue diamond", "bullet"),
      e("🔺", "Red triangle up", "increase up"),
      e("🔻", "Red triangle down", "decrease down"),
    ],
  },
];

function EmojiGrid({
  current,
  onSelect,
}: {
  current: string;
  onSelect: (emoji: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return categories;
    return categories
      .map((category) => ({
        ...category,
        emojis: category.emojis.filter(
          (emoji) =>
            emoji.name.toLowerCase().includes(query) ||
            emoji.keywords.some((keyword) => keyword.includes(query)),
        ),
      }))
      .filter((category) => category.emojis.length > 0);
  }, [search]);

  return (
    <div className="w-[320px]">
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#a49ba9]" />
        <Input
          className="h-8 border-none bg-[#f4f2f6] pl-8 text-[13px] focus-visible:ring-0"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search emoji…"
          value={search}
        />
      </div>
      <div className="mt-1 max-h-[264px] overflow-y-auto px-1">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#8c838f]">No emojis found.</p>
        ) : (
          filtered.map((category) => (
            <div key={category.label}>
              <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a49ba9]">
                {category.label}
              </div>
              <div className="grid grid-cols-8 gap-0.5 pb-1">
                {category.emojis.map((emoji, index) => (
                  <button
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-md text-[17px] leading-none transition hover:bg-[#f3eef7]",
                      emoji.char === current && "bg-[#f3eef7] ring-1 ring-[#c9a8e0]",
                    )}
                    key={`${category.label}-${emoji.name}-${index}`}
                    onClick={() => onSelect(emoji.char)}
                    title={emoji.name}
                    type="button"
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between border-t border-[#eeeaf1] px-3 py-2">
        <span className="text-[10px] text-[#a49ba9]">{categories.length} categories</span>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[#8c838f] transition hover:bg-[#f7f5f8] hover:text-[#5d5263]"
          onClick={() => onSelect("")}
          type="button"
        >
          <FiTrash2 className="size-3" />
          Remove icon
        </button>
      </div>
    </div>
  );
}

export function EmojiPicker({
  align = "start",
  children,
  current,
  onSelect,
}: {
  align?: "start" | "center" | "end";
  children: React.ReactNode;
  current: string;
  onSelect: (emoji: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-1.5">
        <EmojiGrid current={current} onSelect={onSelect} />
      </PopoverContent>
    </Popover>
  );
}