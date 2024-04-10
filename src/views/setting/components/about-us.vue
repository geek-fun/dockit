<template>
  <div class="about-us">
    <h1 class="title">About Us</h1>
    <div class="section">
      <h2 class="subtitle">DocKit</h2>
      <p>
        DocKit is a modern cross-platform NoSQL/NewSQL GUI client. Explore your data any time from
        your Mac, Windows, and Linux.
      </p>
    </div>
    <div class="section">
      <h2 class="subtitle">Features</h2>
      <ul>
        <li>
          Full-featured editor, powered by monaco-editor, the backbone of VSCode, providing a
          familiar editor environment for developers.
        </li>
        <li>Keep your connections in desktop apps, moving the dependencies of dashboard tools.</li>
        <li>
          File persistence, allowing you to save your code in your machine as a file, never lost.
        </li>
        <li>Supports multiple engines including Elasticsearch, OpenSearch, and more to come.</li>
      </ul>
    </div>
    <div class="section">
      <h2 class="subtitle">License</h2>
      <p>DocKit is an open-source project under the Apache 2.0 License.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Add any necessary TypeScript code here
</script>

<style lang="scss" scoped>
@keyframes fadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.about-us {
  animation: fadeIn 2s ease-in;

  .title {
    font-size: 2em;
    text-align: center;
    margin-bottom: 1em;
  }

  .section {
    margin-bottom: 2em;

    .subtitle {
      font-size: 1.5em;
    }

    p,
    ul {
      font-size: 1.2em;
      line-height: 1.5;
    }

    ul {
      padding-left: 1em;
    }
  }
}
</style>
