// Journey imagery already used by Hope Sojourns. No travel availability is promised.
export const DESTINATIONS=[
 {id:'mexico-city',name:'Mexico City',country:'Mexico',image:'/assets/mexico-city.jpg',alt:'A view of Mexico City',url:'/trips/mexico-city/',invitation:'Serve through listening, hospitality and practical care.'},
 {id:'athens',name:'Athens',country:'Greece',image:'/assets/athens.jpg',alt:'A view across Athens',url:'/trips/athens/',invitation:'Make room for people and stories at the crossroads.'},
 {id:'halifax',name:'Halifax',country:'England',image:'/assets/halifax-england-beacon-hill.jpg',alt:'A view of Halifax from Beacon Hill',url:'/interest/',invitation:'Explore what faithful presence could look like in a new community.'},
 {id:'camino-de-santiago',name:'Camino de Santiago',country:'Spain',image:'/assets/metro-journeys/camino-gala-program.png',alt:'Camino walkers on a rocky trail overlooking the coast',url:'/trips/camino-de-santiago/',invitation:'Share steps, reflection and conversation along the way.'},
 {id:'kilimanjaro',name:'Kilimanjaro',country:'Tanzania',image:'/assets/metro-journeys/kilimanjaro-gala-program.png',alt:'Participants together at the Kilimanjaro summit',url:'/trips/kilimanjaro/',invitation:'Explore challenge, preparation and shared purpose.'},
 {id:'kenya',name:'Kenya',country:'East Africa',image:'/assets/kenya.jpg',alt:'Students gathered outdoors in Kenya; representative imagery',url:'/trips/kenya/',invitation:'Encourage learning, dignity and a hopeful future.'},
 {id:'belize',name:'Belize',country:'Central America',image:'/assets/belize-cotton-wood-lodge-loft.png',alt:'The loft at Cotton Wood Lodge in Belize',url:'/trips/belize/',invitation:'Discover service built around local relationships.'},
 {id:'soto',name:'SOTO',country:'Ozarks, Arkansas',image:'/assets/soto-buffalo-conference-center.png',alt:'Shepherd of the Ozarks conference center',url:'/trips/arkansas/',invitation:'Serve close to home with an open heart and willing hands.'},
 {id:'other',name:'The next journey',country:'Still to be discovered',image:'/assets/ministry-gathering-athens.jpg',alt:'A ministry gathering',url:'/trips/others/',invitation:'Keep listening for the next invitation to serve.'}
];
export const destinationFor=id=>DESTINATIONS.find(d=>d.id===id)||null;
