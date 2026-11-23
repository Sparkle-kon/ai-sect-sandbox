import type {SectComedyTemplate} from '../../types/sectComedy';

// 不借用差事结果；「本月闲话」本身就是这一刻的全部来由。
export const AMBIENT_SECT_COMEDY = [
  {
    id:'ambient-plain-ink', match:{phase:'ambient'},
    report:'{name}说起月录该用几滴墨。',
    quote:'「诸事平安」四字就够。多写一滴墨，倒显得我心里有事。', effects:[],
    chatHook:{group:'own',line:'「诸事平安」四字就够，多费墨反显得心虚。'},
  },
  {
    id:'ambient-plain-sock', match:{phase:'ambient'},
    report:'{name}给修行的第一步排了个次序。',
    quote:'欲登九霄，先把袜子穿成一双。前一件可缓，后一件莫笑。', effects:[],
  },
  {
    id:'ambient-plain-shadow', match:{phase:'ambient'},
    report:'{name}说到拜师与学样。',
    quote:'真要拜个勤勉的师父，我荐自己的影子。分文不取，摆起架子却从不落后。', effects:[],
  },
  {
    id:'ambient-plain-errand', match:{phase:'ambient'},
    report:'{name}想给「从容」写一条注脚。',
    quote:'从容者，天塌不慌。若只是被叫去帮忙，倒可以先问要帮多久。', effects:[],
  },
  {
    id:'ambient-plain-pin', match:{phase:'ambient'},
    report:'{name}把一桩小事说得比大道还难。',
    quote:'我倒不怕天道无常，就怕发簪不听话。天道若歪了，旁人总看不出来。', effects:[],
  },
  {
    id:'ambient-plain-leaf', match:{phase:'ambient'},
    report:'{name}拿一片叶子打了个比方。',
    quote:'我若是片叶子，便不争上枝下枝。反正一落地，谁也叫不得师兄。', effects:[],
  },
  {
    id:'ambient-plain-oath', match:{phase:'ambient'},
    report:'{name}琢磨起立誓的措辞。',
    quote:'若要我立誓，便誓言行如一。至于「择日再议」，我最有把握做到。', effects:[],
    chatHook:{group:'own',line:'最有把握践行的一句誓言：择日再议。'},
  },
  {
    id:'ambient-plain-celestial', match:{phase:'ambient'},
    report:'{name}忽然替神仙想了件难事。',
    quote:'若人人成仙都要得道，天上见了面，可还有谁肯先说「我不知道」？', effects:[],
  },
  {
    id:'ambient-plain-varnish', match:{phase:'ambient'},
    report:'{name}问仙风道骨有没有便法。',
    quote:'能否只修仙风，不修道骨？风瞧不见，想来比骨头好蒙混。', effects:[],
  },
  {
    id:'ambient-plain-moon', match:{phase:'ambient'},
    report:'{name}替月亮找了个不露面的理由。',
    quote:'月有阴晴圆缺，也没人问它闭关到了第几重。修成月亮倒轻省。', effects:[],
  },
  {
    id:'ambient-plain-questions', match:{phase:'ambient'},
    report:'{name}给「问心」立了个规矩。',
    quote:'叩问道心，不妨先敲门。若它再问我悟了没有，我便说走错了。', effects:[],
  },
  {
    id:'ambient-plain-punctuation', match:{phase:'ambient'},
    report:'{name}给典籍里的留白另解。',
    quote:'前辈写「余不复言」，后世敬他高深。我若这么写，多半是下面也不会。', effects:[],
    chatHook:{group:'own',line:'我也会写「余不复言」；下面不会，便有了留白。'},
  },

  {
    id:'ambient-home-glutton', match:{phase:'ambient',presence:'home',quirks:['glutton']},
    report:'{name}提了个给本门传口诀的法子。',
    quote:'收息叫「焖」，行气叫「滚」，收功叫「起锅」。这一路，我敢担保记得牢。', effects:[],
    animation:'sparkle',
  },
  {
    id:'ambient-home-lost', match:{phase:'ambient',presence:'home',quirks:['lost']},
    report:'{name}给本门的地名提了个新说法。',
    quote:'山外再说东南西北。宗里只消叫「挨着掌门」和「最好离掌门远些」，我定能认准。', effects:[],
  },
  {
    id:'ambient-home-shy', match:{phase:'ambient',presence:'home',quirks:['shy']},
    report:'{name}问起晨会该如何应名。',
    quote:'点到我的时候，能不能只点姓？余下那几个字，容我慢慢脸红。', effects:[],
    animation:'sweat',
  },
  {
    id:'ambient-home-chatterbox', match:{phase:'ambient',presence:'home',quirks:['chatterbox']},
    report:'{name}说起宗里为何爱讲「长话短说」。',
    quote:'我也赞成。所谓短说，从哪里起算且容我说明；这里原有三个讲法。', effects:[],
    chatHook:{group:'own',line:'且听我长话短说。至于短在哪里，容我从头说起。'},
  },
  {
    id:'ambient-home-miser', match:{phase:'ambient',presence:'home',quirks:['miser']},
    report:'{name}给本门过日子提了个主意。',
    quote:'若要给祖师上香，三炷照旧，许愿能否合写一张？祖师阅起来也省力。', effects:[],
  },
  {
    id:'ambient-home-drama', match:{phase:'ambient',presence:'home',quirks:['drama']},
    report:'{name}想替晨会琢磨一句开场白。',
    quote:'「诸位来得正好」太平淡。不如「苍天有眼，诸位竟都肯来！」', effects:[],
    animation:'sparkle',
  },
  {
    id:'ambient-home-contrarian', match:{phase:'ambient',presence:'home',quirks:['contrarian']},
    report:'{name}对「同门一心」有些异议。',
    quote:'同门自然该一心。我偏要持异议，不然赞成的那几位跟谁一心？', effects:[],
  },
  {
    id:'ambient-home-lovestruck', match:{phase:'ambient',presence:'home',quirks:['lovestruck']},
    report:'{name}另解同门之间的一个「可」字。',
    quote:'一句「可」能有两层意思。若是掌门在晨会上说，多半当真就是「可」。', effects:[],
    animation:'sweat',
  },
  {
    id:'ambient-home-jinx', match:{phase:'ambient',presence:'home',quirks:['jinx']},
    report:'{name}想给同门换一种祝法。',
    quote:'本月我不说「万事顺遂」。若有什么事非要遂我的愿，请它先排个队。', effects:[],
  },
  {
    id:'ambient-home-neat', match:{phase:'ambient',presence:'home',quirks:['neat_freak']},
    report:'{name}给本门的摆设提了个讲究。',
    quote:'蒲团正北，鞋尖向外；倘若悟出的道理歪一点，倒不妨。道理不碍扫地。', effects:[],
  },
  {
    id:'ambient-home-chuunibyou', match:{phase:'ambient',presence:'home',quirks:['chuunibyou']},
    report:'{name}想为本门的点名另立名目。',
    quote:'我号「玄霄无相君」。若念着不便，唤我「到」亦可；省去那一串名号正是无相。', effects:[],
  },
  {
    id:'ambient-home-coward', match:{phase:'ambient',presence:'home',quirks:['coward_king']},
    report:'{name}对晨会的坐次另有一番见解。',
    quote:'掌门坐上首是镇场。我想坐近门处，万一要请人进来，显得我格外勤快。', effects:[],
    animation:'sweat',
  },

  {
    id:'ambient-away-glutton', match:{phase:'ambient',presence:'away',quirks:['glutton']},
    report:'{name}把「辟谷」拆开说了。',
    quote:'不吃谷，未必不吃肉。圣贤惜字如金，弟子自当领会这番苦心。', effects:[],
  },
  {
    id:'ambient-away-lost', match:{phase:'ambient',presence:'away',quirks:['lost']},
    report:'{name}细论问路的窍门。',
    quote:'我若问路，必先问哪条不是。认对一条难，少认错一条便算小成。', effects:[],
    animation:'black_line',
  },
  {
    id:'ambient-away-shy', match:{phase:'ambient',presence:'away',quirks:['shy']},
    report:'{name}给自报名号想了个办法。',
    quote:'修行人若非得先报姓名，我想练一门隔空递名帖的法术。最好连落款也能躲开。', effects:[],
  },
  {
    id:'ambient-away-chatterbox', match:{phase:'ambient',presence:'away',quirks:['chatterbox']},
    report:'{name}说到假使遇见一位修闭口禅的人。',
    quote:'那倒合拍。我说话，他修行；若他修得成，想来也有我的一份功劳。', effects:[],
  },
  {
    id:'ambient-away-miser', match:{phase:'ambient',presence:'away',quirks:['miser']},
    report:'{name}连买一句指点也想论斤。',
    quote:'前辈若肯按字收指点钱，我就问一个「解」字。请他答长些，价钱另论。', effects:[],
  },
  {
    id:'ambient-away-drama', match:{phase:'ambient',presence:'away',quirks:['drama']},
    report:'{name}琢磨起独行人登场的气派。',
    quote:'若要我在传里登场，劳烦加一句「天地为之一寂」。旁人一声不吭，也就有了交代。', effects:[],
  },
  {
    id:'ambient-away-contrarian', match:{phase:'ambient',presence:'away',quirks:['contrarian']},
    report:'{name}不肯照收一句常言。',
    quote:'都说远亲不如近邻。我看先问近邻借不借伞，再来贬低远亲也不迟。', effects:[],
  },
  {
    id:'ambient-away-lovestruck', match:{phase:'ambient',presence:'away',quirks:['lovestruck']},
    report:'{name}替一封尚未写成的信挑开头。',
    quote:'署「展信佳」怕太客气，写「见字如晤」又怕人当真。我还是先练练自己的落款。', effects:[],
  },
  {
    id:'ambient-away-jinx', match:{phase:'ambient',presence:'away',quirks:['jinx']},
    report:'{name}不大肯替天说话。',
    quote:'「看天色不碍事」这句话，旁人尽可以讲。我一说，倒像递了张请帖。', effects:[],
    animation:'sweat',
  },
  {
    id:'ambient-away-neat', match:{phase:'ambient',presence:'away',quirks:['neat_freak']},
    report:'{name}设想了一件最趁手的法宝。',
    quote:'我不求能装下一座山的袖子。它肯叫左袖只装左袖的东西，便是至宝。', effects:[],
  },
  {
    id:'ambient-away-chuunibyou', match:{phase:'ambient',presence:'away',quirks:['chuunibyou']},
    report:'{name}替自己设想了一个字号。',
    quote:'日后我若号「无名客」，请写大些。字号既不响亮，字总得叫人看清。', effects:[],
    animation:'sparkle',
  },
  {
    id:'ambient-away-coward', match:{phase:'ambient',presence:'away',quirks:['coward_king']},
    report:'{name}给江湖上的挑战另立了次序。',
    quote:'假若有人拦我约斗，我先请教尊姓。称一声「前辈告辞」，也算把礼数走完。', effects:[],
  },

  {
    id:'ambient-pair-shy-chatterbox', match:{phase:'ambient',quirks:['shy','chatterbox']},
    report:'{name}辨了辨寡言和无话的分别。',
    quote:'我是不敢开口，不是无话可讲。您转过身去，我能从前朝讲到下个月。', effects:[],
    animation:'sweat',
  },
  {
    id:'ambient-pair-miser-drama', match:{phase:'ambient',quirks:['miser','drama']},
    report:'{name}想给一句壮语加个小注。',
    quote:'愿为本门赴汤蹈火。敢问这柴钱，从哪一册支？', effects:[],
    chatHook:{group:'own',line:'赴汤蹈火自当去，先问一句柴钱从哪一册支。'},
  },
  {
    id:'ambient-pair-contrarian-neat', match:{phase:'ambient',quirks:['contrarian','neat_freak']},
    report:'{name}给异议也定了个规矩。',
    quote:'我不同意大伙句句相同。反对的句子我想了三条，倒是齐齐整整，一字不多一字不少。', effects:[],
  },
  {
    id:'ambient-pair-love-chuunibyou', match:{phase:'ambient',quirks:['lovestruck','chuunibyou']},
    report:'{name}琢磨什么样的称呼最动人。',
    quote:'「星河剑尊」是让外人叫的。倘若知心人肯叫一声「哎」，我那一串尊号也可以不要。', effects:[],
    animation:'sparkle',
  },
  {
    id:'ambient-pair-glutton-coward', match:{phase:'ambient',quirks:['glutton','coward_king']},
    report:'{name}颇讲究该如何试菜。',
    quote:'若一道菜名叫「火海取珠」，请先给我看菜谱。若只是一碗辣汤，再添一碗饭。', effects:[],
  },
  {
    id:'ambient-pair-lost-jinx', match:{phase:'ambient',quirks:['lost','jinx']},
    report:'{name}谈起自己能给的指点。',
    quote:'我不押凶吉。贫道连「东」也不敢押。', effects:[],
    chatHook:{group:'own',line:'我不押凶吉，连「东」也不敢押。'},
  },
] as const satisfies readonly SectComedyTemplate[];
