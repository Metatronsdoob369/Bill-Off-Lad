rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{leadId} {
      // Anyone may CREATE a lead with strict validation on all 6 keys
      allow create: if
        request.resource.data.keys().hasAll(['email', 'timestamp', 'source', 'tier', 'channel', 'search_query']) &&
        request.resource.data.keys().hasOnly(['email', 'timestamp', 'source', 'tier', 'channel', 'search_query']) &&
        request.resource.data.email is string &&
        request.resource.data.email.size() >= 5 &&
        request.resource.data.email.size() <= 254 &&
        request.resource.data.email.matches('^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$') &&
        request.resource.data.timestamp == request.time &&
        request.resource.data.source in [
          'nav_cta',
          'hero_inline',
          'broker_search_gate',
          'post_demo_inline',
          'pricing_tier_cta',
          'final_cta_inline'
        ] &&
        (request.resource.data.tier == null || request.resource.data.tier in [
          'Dock & Broker Audit — Free',
          'Recovery + Search — $99/truck/mo',
          'Back-Claims — 20% of recovery'
        ]) &&
        (request.resource.data.channel == null || (
          request.resource.data.channel is string &&
          request.resource.data.channel.size() <= 120
        )) &&
        (request.resource.data.search_query == null || (
          request.resource.data.search_query is string &&
          request.resource.data.search_query.size() <= 100
        ));

      // Nobody may read, update, or delete leads from the public site
      allow read, update, delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}